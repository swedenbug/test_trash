/*
  sync.js — обмен данными с сервером.
  Назначение: отправить свои изменения и забрать чужие.
  Зависимости: store, schema.

  Местное хранилище остаётся единственным, с чем работают модули. Обмен идёт
  сбоку и переживает разрывы связи: не ушло сейчас — уйдёт в следующий раз.
  Приложение работает без сети точно так же, как с ней.

  Отметки времени берутся у сервера, а не у себя. Часы устройства и часы
  сервера расходятся, и курсор, посчитанный не там, начнёт терять записи.
*/

import { SYNCED, nowIso } from './schema.js';

const CONFIG = 'config';

export function createSync(store) {
  let running = null;

  async function readConfig() {
    return (await store.get('sync_state', CONFIG)) ?? { id: CONFIG, url: null, token: null };
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

  /** Сколько записей ждёт отправки. Нужно только для показа в меню. */
  async function pending() {
    let count = 0;
    for (const c of SYNCED) {
      const { pushed_at } = await cursor(c);
      const rows = await store.list(c, { includeDeleted: true });
      count += rows.filter((r) => !pushed_at || r.updated_at > pushed_at).length;
    }
    return count;
  }

  async function push(config) {
    const changes = {};
    const marks = {};
    let total = 0;

    for (const c of SYNCED) {
      const { pushed_at } = await cursor(c);
      const rows = (await store.list(c, { includeDeleted: true }))
        .filter((r) => !pushed_at || r.updated_at > pushed_at);

      if (!rows.length) continue;
      changes[c] = rows;
      total += rows.length;

      // Курсор двигаем по самой поздней отправленной записи, а не по «сейчас»:
      // иначе правка, сделанная во время запроса, потеряется навсегда.
      marks[c] = rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), '');
    }

    if (!total) return 0;

    await request(config, '/changes', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    });

    for (const [c, mark] of Object.entries(marks)) {
      const state = await cursor(c);
      await store.put('sync_state', { ...state, pushed_at: mark });
    }

    return total;
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
      };
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
        const pushed = await push(config);
        const pulled = await pull(config);
        return { pushed, pulled, at: nowIso() };
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
