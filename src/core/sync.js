/*
  sync.js - обмен данными с сервером.
  Назначение: отправить свои изменения и забрать чужие.
  Зависимости: store, schema.

  Местное хранилище остаётся единственным, с чем работают модули. Обмен идёт
  сбоку и переживает разрывы связи: не ушло сейчас - уйдёт в следующий раз.
  Приложение работает без сети точно так же, как с ней.

  Отметки времени берутся у сервера, а не у себя. Часы устройства и часы
  сервера расходятся, и курсор, посчитанный не там, начнёт терять записи.
*/

import { SYNCED, nowIso } from './schema.js';

const CONFIG = 'config';

/*
  Записи, которые сервер не принял. Лежат в settings отдельным ключом, а не
  колонкой в прикладной таблице: схема закрыта, и заводить поле ради служебной
  пометки значило бы платить обменом за местное знание.

  Ключ на сервер не уезжает - см. фильтр в push(). Список привязан к устройству,
  как адрес и пропуск.
*/
const REJECTED = 'sync.rejected';

export function createSync(store) {
  let running = null;

  async function readConfig() {
    return (await store.get('sync_state', CONFIG)) ?? { id: CONFIG, url: null, token: null };
  }

  async function readRejected() {
    return (await store.get('settings', REJECTED))?.value ?? {};
  }

  async function writeRejected(map) {
    return store.put('settings', { id: REJECTED, value: map, updated_at: nowIso() });
  }

  /** Строки, которые сервер уже отверг и которые с тех пор не правили. */
  function isStuck(row, rejected) {
    const mark = rejected[row.id];
    return Boolean(mark) && row.updated_at <= mark.at;
  }

  async function cursor(collection) {
    return (await store.get('sync_state', collection))
        ?? { id: collection, pulled_at: null, pushed_at: null };
  }

  async function request(config, path, options = {}) {
    const base = config.url.replace(/\/+$/, '');
    const res = await fetch(base + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
        ...options.headers,
      },
    });

    if (res.status === 401) throw new Error('сервер не принял пропуск');
    if (!res.ok) throw new Error(`сервер ответил ${res.status}`);
    return res.json();
  }

  /** Строки коллекции, которые сейчас имеет смысл отправлять. */
  async function outgoing(c, rejected) {
    const { pushed_at } = await cursor(c);
    return (await store.list(c, { includeDeleted: true }))
      .filter((r) => !pushed_at || r.updated_at > pushed_at)
      .filter((r) => !(c === 'settings' && r.id === REJECTED))
      .filter((r) => !isStuck(r, rejected));
  }

  /** Сколько записей ждёт отправки. Нужно только для показа в меню. */
  async function pending() {
    const rejected = await readRejected();
    let count = 0;
    for (const c of SYNCED) count += (await outgoing(c, rejected)).length;
    return count;
  }

  async function push(config) {
    const rejected = await readRejected();
    const changes = {};
    const marks = {};
    let total = 0;
    let touched = false;

    for (const c of SYNCED) {
      const rows = await outgoing(c, rejected);

      // Запись поправили после отказа - снимаем пометку, уходит обычным порядком.
      for (const r of rows) {
        if (rejected[r.id]) { delete rejected[r.id]; touched = true; }
      }

      if (!rows.length) continue;
      changes[c] = rows;
      total += rows.length;

      // Курсор двигаем по самой поздней отправленной записи, а не по «сейчас»:
      // иначе правка, сделанная во время запроса, потеряется навсегда.
      marks[c] = rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), '');
    }

    if (!total) {
      if (touched) await writeRejected(rejected);
      return { sent: 0, refused: 0 };
    }

    const answer = await request(config, '/changes', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    });

    /*
      Сервер отбрасывает негодную запись поштучно и называет её в ответе.
      Без этого разбора курсор уехал бы по всей пачке, а отвергнутая запись
      пропала бы тихо - хуже, чем отказ пачки целиком.
    */
    const refused = answer?.rejected ?? [];
    for (const r of refused) {
      if (!r?.id) continue;
      rejected[r.id] = { table: r.table ?? null, reason: r.reason ?? 'constraint', at: nowIso() };
      touched = true;
    }
    if (touched) await writeRejected(rejected);

    for (const [c, mark] of Object.entries(marks)) {
      const state = await cursor(c);
      await store.put('sync_state', { ...state, pushed_at: mark });
    }

    /*
      Отправленное и принятое - разные числа. Считать успех по числу отосланных
      записей значит показывать «Отправлено 3» на пачке, отвергнутой целиком.

      Считать по accepted из ответа тоже нельзя: там количество изменённых строк,
      и запись, уже лежащая на сервере в той же версии, даёт ноль. После
      переотправки вышло бы «отправлено 0» - новая неправда вместо старой.
    */
    return { sent: total, refused: refused.length };
  }

  async function pull(config) {
    let applied = 0;

    for (const c of SYNCED) {
      const state = await cursor(c);
      const since = state.pulled_at ?? '1970-01-01T00:00:00.000Z';

      const data = await request(config, `/changes?since=${encodeURIComponent(since)}`);
      const rows = data.changes?.[c] ?? [];

      if (rows.length) applied += await store.mergeIncoming(c, rows);

      // Отметка сервера, а не своя: сервер отбирает записи по своим часам.
      await store.put('sync_state', { ...state, pulled_at: data.now });
    }

    return applied;
  }

  const api = {
    async config() {
      const { url, token } = await readConfig();
      return { url, token, configured: Boolean(url && token) };
    },

    async setConfig({ url, token }) {
      const current = await readConfig();
      return store.put('sync_state', {
        ...current,
        id: CONFIG,
        url: url?.trim() || null,
        token: token?.trim() || null,
      });
    },

    /** Проверка связи и пропуска без обмена данными. */
    async check() {
      const config = await readConfig();
      if (!config.url || !config.token) throw new Error('адрес и пропуск не заданы');
      await request(config, '/changes?since=' + encodeURIComponent(nowIso()));
      return true;
    },

    async state() {
      const config = await readConfig();
      const marks = await Promise.all(SYNCED.map((c) => cursor(c)));
      const last = marks
        .map((m) => m.pulled_at)
        .filter(Boolean)
        .sort()
        .pop() ?? null;

      return {
        configured: Boolean(config.url && config.token),
        url: config.url,
        lastSync: last,
        pending: await pending(),
        rejected: Object.keys(await readRejected()).length,
      };
    },

    /*
      Снять пометки и отправить заново. Нужно, когда причина отказа устранена
      не на устройстве, а на сервере: запись не менялась, её updated_at прежний,
      и сама она из списка уже никогда не выйдет.

      Одной очистки пометок мало. Курсор после отказа мог уехать вперёд по более
      свежим записям, и тогда отвергнутая осталась бы ниже него - отпущенная,
      но невидимая для отправки. Поэтому курсор отматывается на миллисекунду
      назад от самой ранней отвергнутой записи в коллекции.
    */
    async retryRejected() {
      const map = await readRejected();
      const ids = Object.keys(map);
      if (!ids.length) return 0;

      for (const c of SYNCED) {
        const rows = await store.list(c, { includeDeleted: true });
        const earliest = rows
          .filter((r) => map[r.id])
          .reduce((min, r) => (!min || r.updated_at < min ? r.updated_at : min), null);
        if (!earliest) continue;

        const state = await cursor(c);
        if (!state.pushed_at || state.pushed_at < earliest) continue;

        const back = new Date(new Date(earliest).getTime() - 1).toISOString();
        await store.put('sync_state', { ...state, pushed_at: back });
      }

      await writeRejected({});
      return ids.length;
    },

    /** Что сервер не принял: коллекция, время отказа, причина. Свежие сверху. */
    async rejectedList() {
      const map = await readRejected();
      return Object.entries(map)
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => (a.at < b.at ? 1 : -1));
    },

    /** Полный обмен. Повторный вызов во время работы возвращает тот же результат. */
    async run() {
      if (running) return running;

      running = (async () => {
        const config = await readConfig();
        if (!config.url || !config.token) throw new Error('адрес и пропуск не заданы');
        if (!navigator.onLine) throw new Error('нет сети');

        // Сначала отдаём своё, потом забираем чужое: так свежая местная правка
        // не будет затёрта той же записью, пришедшей с сервера в старой версии.
        const { sent, refused } = await push(config);
        const pulled = await pull(config);
        return { pushed: sent, refused, pulled, at: nowIso() };
      })();

      try {
        return await running;
      } finally {
        running = null;
      }
    },
  };

  return api;
}
