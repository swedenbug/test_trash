/*
  check.js - самопроверка ядра.
  Назначение: прогнать хранилище и схему по всем основным сценариям
  и показать результат списком.
  Зависимости: schema.js, store.js, adapter-local.js.

  Работает в отдельном пространстве ключей 'pr:test:' и убирает за собой.
  Настоящие данные приложения не затрагиваются ни при каком исходе.
*/

import { createLocalAdapter } from './adapter-local.js';
import { createStore } from './store.js';
import { SCHEMA_VERSION, localDate, nowIso, validate } from './schema.js';

const adapter = createLocalAdapter({ prefix: 'pr:test:' });
const store = createStore(adapter);

/* Каждая проверка возвращает строку с подробностью либо бросает ошибку. */
const tests = [
  {
    name: 'Схема загружена',
    async run() {
      return `версия ${SCHEMA_VERSION}`;
    },
  },

  {
    name: 'Пустая таблица читается',
    async run() {
      await store.wipe();
      const rows = await store.list('entry');
      if (rows.length !== 0) throw new Error(`ожидалось 0 записей, получено ${rows.length}`);
      return 'нет записей';
    },
  },

  {
    name: 'Тема и запись создаются',
    async run() {
      const theme = await store.put('theme', {
        name: 'Проверка', kind: 'count', urgency_kind: 'none',
      });
      if (!Array.isArray(theme.quick)) throw new Error('quick по умолчанию не массив');
      if (theme.active !== true) throw new Error('active по умолчанию не да');
      ctx.themeId = theme.id;

      const rec = await store.put('entry', {
        theme_id: theme.id, at: nowIso(), value: 250, source: 'tap',
      });
      if (!rec.id) throw new Error('не проставлен id');
      if (!rec.created_at || !rec.updated_at) throw new Error('не проставлены метки времени');
      if (rec.deleted_at !== null) throw new Error('запись создана уже удалённой');
      ctx.id = rec.id;
      return `тема и запись на ${rec.value}, id получены`;
    },
  },

  {
    name: 'Локальная дата выведена',
    async run() {
      const rec = await store.get('entry', ctx.id);
      const expected = localDate(rec.at, 0);
      if (rec.local_date !== expected) {
        throw new Error(`ожидалось ${expected}, получено ${rec.local_date}`);
      }
      return rec.local_date;
    },
  },

  {
    name: 'Негодная запись отклонена',
    async run() {
      /*
        Верхней границы у value больше нет - потолок в 5000 был правилом воды.
        Проверка на 9999 потеряла смысл и заменена на запись без темы:
        `theme_id` обязателен, и его отсутствие раньше не проверялось ничем.
      */
      const cases = [
        { theme_id: ctx.themeId, at: nowIso(), value: -1,  source: 'tap' },
        { theme_id: ctx.themeId, at: nowIso(), value: 250, source: 'дно' },
        { at: nowIso(), value: 250, source: 'tap' },
        { theme_id: ctx.themeId, at: 'вчера',  value: 250, source: 'tap' },
      ];
      for (const bad of cases) {
        let passed = false;
        try { await store.put('entry', bad); passed = true; } catch (e) { /* ожидаемо */ }
        if (passed) throw new Error(`пропущена негодная запись: ${JSON.stringify(bad)}`);
      }

      // Отдельно - форма quick: у сервера на этой колонке jsonb_typeof = 'array'.
      let quickPassed = false;
      try {
        await store.put('theme', {
          name: 'Кривая', kind: 'count', urgency_kind: 'none', quick: '250',
        });
        quickPassed = true;
      } catch (e) { /* ожидаемо */ }
      if (quickPassed) throw new Error('quick строкой прошёл проверку');

      return `${cases.length + 1} из ${cases.length + 1} отклонены`;
    },
  },

  {
    name: 'Неописанное поле отклонено',
    async run() {
      const { ok } = validate('entry', {
        id: 'x', theme_id: 't', created_at: nowIso(), updated_at: nowIso(), deleted_at: null,
        at: nowIso(), local_date: '2026-01-01', value: 250, source: 'tap', note: null,
        лишнее: 1,
      });
      if (ok) throw new Error('лишнее поле прошло проверку');
      return 'схема закрыта';
    },
  },

  {
    name: 'Подписка срабатывает',
    async run() {
      let calls = 0;
      const off = store.onChange('entry', () => { calls++; });
      await store.put('entry', { theme_id: ctx.themeId, at: nowIso(), value: 500, source: 'hold' });
      off();
      await store.put('entry', { theme_id: ctx.themeId, at: nowIso(), value: 300, source: 'manual' });
      if (calls !== 1) throw new Error(`ожидался 1 вызов, получено ${calls}`);
      return 'вызвана и отписана';
    },
  },

  {
    name: 'Список отсортирован и полон',
    async run() {
      const rows = await store.list('entry');
      if (rows.length !== 3) throw new Error(`ожидалось 3 записи, получено ${rows.length}`);
      for (let i = 1; i < rows.length; i++) {
        if (rows[i - 1].at < rows[i].at) throw new Error('порядок нарушен');
      }
      return `${rows.length} записи, свежие сверху`;
    },
  },

  {
    name: 'Мягкое удаление',
    async run() {
      await store.remove('entry', ctx.id);
      const visible = await store.list('entry');
      const all = await store.list('entry', { includeDeleted: true });
      const gone = await store.get('entry', ctx.id);
      if (visible.length !== 2) throw new Error('удалённая запись осталась в списке');
      if (all.length !== 3) throw new Error('запись стёрта насовсем');
      if (!gone.deleted_at) throw new Error('не проставлена метка удаления');
      return 'скрыта, но сохранена';
    },
  },

  {
    name: 'Возврат удалённой записи',
    async run() {
      await store.restore('entry', ctx.id);
      const visible = await store.list('entry');
      if (visible.length !== 3) throw new Error('запись не вернулась');
      return 'вернулась в список';
    },
  },

  {
    name: 'Настройки: значение по умолчанию',
    async run() {
      // Водные ключи ушли вместе с водой; из умолчаний остался один.
      const v = await store.setting('day_start_hour');
      if (v !== 0) throw new Error(`ожидался 0, получено ${v}`);
      return `граница суток ${v}:00`;
    },
  },

  {
    name: 'Настройки: сохранение',
    async run() {
      await store.setSetting('day_start_hour', 4);
      const v = await store.setting('day_start_hour');
      if (v !== 4) throw new Error(`ожидалось 4, получено ${v}`);
      await store.setSetting('day_start_hour', 0);   // не влиять на соседние проверки
      return 'значение перекрыто';
    },
  },

  {
    name: 'Выгрузка и загрузка',
    async run() {
      const dump = await store.exportAll();
      if (dump.format !== 'progress-export') throw new Error('неверный формат выгрузки');

      await store.wipe();
      if ((await store.list('entry')).length !== 0) throw new Error('очистка не сработала');

      await store.importAll(dump, { mode: 'replace' });
      const rows = await store.list('entry');
      if (rows.length !== 3) throw new Error(`после загрузки ${rows.length} записей вместо 3`);
      return `${rows.length} записи восстановлены`;
    },
  },

  {
    name: 'Слияние по времени изменения',
    async run() {
      const rows = await store.list('entry');
      const target = rows[0];

      const dump = await store.exportAll();
      const copy = JSON.parse(JSON.stringify(dump));
      const edited = copy.data.entry.find((r) => r.id === target.id);
      edited.value = 777;
      edited.updated_at = new Date(Date.now() + 60000).toISOString();

      await store.importAll(copy, { mode: 'merge' });
      const after = await store.get('entry', target.id);
      if (after.value !== 777) throw new Error('победила устаревшая запись');

      const count = (await store.list('entry')).length;
      if (count !== 3) throw new Error(`слияние размножило записи: ${count}`);
      return 'победила свежая версия';
    },
  },

  {
    name: 'Чужой файл отклонён',
    async run() {
      let passed = false;
      try { await store.importAll({ format: 'что-то другое' }); passed = true; } catch (e) { /* ожидаемо */ }
      if (passed) throw new Error('принят посторонний файл');
      return 'формат проверяется';
    },
  },

  {
    name: 'Занятый объём',
    async run() {
      const bytes = await store.usage();
      return `${(bytes / 1024).toFixed(1)} КБ на тестовых данных`;
    },
  },

  {
    name: 'Миграция до текущей версии',
    async run() {
      const { to, applied } = await store.init();
      const meta = await store.meta();
      if (!meta) throw new Error('служебная строка не создана');
      if (meta.schema_version !== to) throw new Error('версия не записана');
      if (!meta.device_id) throw new Error('не назначен идентификатор устройства');
      return `версия ${to}, шагов применено ${applied.length}`;
    },
  },

  {
    name: 'Идентификатор устройства переживает миграцию',
    async run() {
      const before = (await store.meta()).device_id;
      await store.init();
      const after = (await store.meta()).device_id;
      if (before !== after) throw new Error('идентификатор сменился на ровном месте');
      return 'сохранён';
    },
  },

  {
    name: 'Загрузка не подменяет служебную строку',
    async run() {
      const mine = (await store.meta()).device_id;
      const dump = await store.exportAll();
      dump.data.meta = [{ id: 'meta', schema_version: 1, device_id: 'чужое-устройство',
                          updated_at: nowIso() }];
      await store.importAll(dump, { mode: 'replace' });
      const after = (await store.meta()).device_id;
      if (after !== mine) throw new Error('подставлен чужой идентификатор');
      return 'осталась своя';
    },
  },

  {
    name: 'Таблица состояния обмена',
    async run() {
      const state = { id: 'entry', pulled_at: null, pushed_at: nowIso() };
      const saved = await store.put('sync_state', state);
      if (saved.url !== null) throw new Error('не проставлено значение по умолчанию');
      const back = await store.get('sync_state', 'entry');
      if (back.pushed_at !== state.pushed_at) throw new Error('отметка не сохранилась');
      return 'курсоры пишутся и читаются';
    },
  },

  {
    name: 'Приём чужой записи не перебивает время',
    async run() {
      const mark = new Date(Date.now() + 3600000).toISOString();
      const alien = {
        id: crypto.randomUUID(), theme_id: ctx.themeId, at: nowIso(), local_date: '2026-01-01',
        value: 300, source: 'manual', note: null,
        created_at: mark, updated_at: mark, deleted_at: null,
      };
      const applied = await store.mergeIncoming('entry', [alien]);
      if (applied !== 1) throw new Error('запись не принята');

      const saved = await store.get('entry', alien.id);
      if (saved.updated_at !== mark) throw new Error('время правки перебито своим');
      ctx.alienId = alien.id;
      return 'время правки сохранено';
    },
  },

  {
    name: 'Устаревшая чужая запись отклоняется',
    async run() {
      const mine = await store.get('entry', ctx.alienId);
      const stale = { ...mine, value: 999,
                      updated_at: new Date(Date.parse(mine.updated_at) - 60000).toISOString() };
      const applied = await store.mergeIncoming('entry', [stale]);
      if (applied !== 0) throw new Error('победила устаревшая версия');

      const after = await store.get('entry', ctx.alienId);
      if (after.value !== mine.value) throw new Error('запись всё-таки перезаписана');
      return 'победила свежая';
    },
  },

  {
    name: 'Негодная чужая запись не ломает приём',
    async run() {
      const good = {
        id: crypto.randomUUID(), theme_id: ctx.themeId, at: nowIso(), local_date: '2026-01-01',
        value: 200, source: 'tap', note: null,
        created_at: nowIso(), updated_at: nowIso(), deleted_at: null,
      };
      const bad = { id: crypto.randomUUID(), value: -5, source: 'дно' };
      const applied = await store.mergeIncoming('entry', [bad, good]);
      if (applied !== 1) throw new Error(`принято ${applied} вместо одной`);
      return 'негодная отброшена, годная принята';
    },
  },

  {
    name: 'Уборка за собой',
    async run() {
      await store.wipe();
      const left = await store.list('entry', { includeDeleted: true });
      if (left.length !== 0) throw new Error('тестовые данные остались');
      return 'тестовое пространство пусто';
    },
  },
];

const ctx = {};

/* ------------------------------------------------------------------ */

function row(name, state, value) {
  const li = document.createElement('li');

  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.dataset.state = state;

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = name;

  const val = document.createElement('span');
  val.className = 'value';
  val.textContent = value;

  li.append(dot, label, val);
  return li;
}

async function run() {
  const list = document.getElementById('checks');
  list.innerHTML = '';
  let failed = 0;

  for (const test of tests) {
    try {
      const detail = await test.run();
      list.append(row(test.name, 'ok', detail));
    } catch (e) {
      failed++;
      list.append(row(test.name, 'fail', e.message));
    }
  }

  const total = tests.length;
  document.getElementById('verdict').textContent = failed === 0
    ? `Ядро исправно: ${total} из ${total} проверок пройдено`
    : `Провалено проверок: ${failed} из ${total}`;
  document.getElementById('verdict').dataset.state = failed === 0 ? 'ok' : 'fail';
}

run();
document.getElementById('again').addEventListener('click', run);
