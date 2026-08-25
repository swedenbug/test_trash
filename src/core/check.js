/*
  check.js — самопроверка ядра.
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
      const rows = await store.list('water_intake');
      if (rows.length !== 0) throw new Error(`ожидалось 0 записей, получено ${rows.length}`);
      return 'нет записей';
    },
  },

  {
    name: 'Запись создаётся',
    async run() {
      const rec = await store.put('water_intake', {
        at: nowIso(), amount_ml: 250, source: 'tap',
      });
      if (!rec.id) throw new Error('не проставлен id');
      if (!rec.created_at || !rec.updated_at) throw new Error('не проставлены метки времени');
      if (rec.deleted_at !== null) throw new Error('запись создана уже удалённой');
      ctx.id = rec.id;
      return `${rec.amount_ml} мл, id получен`;
    },
  },

  {
    name: 'Локальная дата выведена',
    async run() {
      const rec = await store.get('water_intake', ctx.id);
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
      const cases = [
        { at: nowIso(), amount_ml: 0,    source: 'tap'  },
        { at: nowIso(), amount_ml: 250,  source: 'дно'  },
        { at: nowIso(), amount_ml: 9999, source: 'tap'  },
        { at: 'вчера',  amount_ml: 250,  source: 'tap'  },
      ];
      for (const bad of cases) {
        let passed = false;
        try { await store.put('water_intake', bad); passed = true; } catch (e) { /* ожидаемо */ }
        if (passed) throw new Error(`пропущена негодная запись: ${JSON.stringify(bad)}`);
      }
      return `${cases.length} из ${cases.length} отклонены`;
    },
  },

  {
    name: 'Неописанное поле отклонено',
    async run() {
      const { ok } = validate('water_intake', {
        id: 'x', created_at: nowIso(), updated_at: nowIso(), deleted_at: null,
        at: nowIso(), local_date: '2026-01-01', amount_ml: 250, source: 'tap', note: null,
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
      const off = store.onChange('water_intake', () => { calls++; });
      await store.put('water_intake', { at: nowIso(), amount_ml: 500, source: 'hold' });
      off();
      await store.put('water_intake', { at: nowIso(), amount_ml: 300, source: 'manual' });
      if (calls !== 1) throw new Error(`ожидался 1 вызов, получено ${calls}`);
      return 'вызвана и отписана';
    },
  },

  {
    name: 'Список отсортирован и полон',
    async run() {
      const rows = await store.list('water_intake');
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
      await store.remove('water_intake', ctx.id);
      const visible = await store.list('water_intake');
      const all = await store.list('water_intake', { includeDeleted: true });
      const gone = await store.get('water_intake', ctx.id);
      if (visible.length !== 2) throw new Error('удалённая запись осталась в списке');
      if (all.length !== 3) throw new Error('запись стёрта насовсем');
      if (!gone.deleted_at) throw new Error('не проставлена метка удаления');
      return 'скрыта, но сохранена';
    },
  },

  {
    name: 'Возврат удалённой записи',
    async run() {
      await store.restore('water_intake', ctx.id);
      const visible = await store.list('water_intake');
      if (visible.length !== 3) throw new Error('запись не вернулась');
      return 'вернулась в список';
    },
  },

  {
    name: 'Настройки: значение по умолчанию',
    async run() {
      const v = await store.setting('water.tap_ml');
      if (v !== 250) throw new Error(`ожидалось 250, получено ${v}`);
      return `${v} мл`;
    },
  },

  {
    name: 'Настройки: сохранение',
    async run() {
      await store.setSetting('water.tap_ml', 300);
      const v = await store.setting('water.tap_ml');
      if (v !== 300) throw new Error(`ожидалось 300, получено ${v}`);
      return 'значение перекрыто';
    },
  },

  {
    name: 'Выгрузка и загрузка',
    async run() {
      const dump = await store.exportAll();
      if (dump.format !== 'progress-export') throw new Error('неверный формат выгрузки');

      await store.wipe();
      if ((await store.list('water_intake')).length !== 0) throw new Error('очистка не сработала');

      await store.importAll(dump, { mode: 'replace' });
      const rows = await store.list('water_intake');
      if (rows.length !== 3) throw new Error(`после загрузки ${rows.length} записей вместо 3`);
      return `${rows.length} записи восстановлены`;
    },
  },

  {
    name: 'Слияние по времени изменения',
    async run() {
      const rows = await store.list('water_intake');
      const target = rows[0];

      const dump = await store.exportAll();
      const copy = JSON.parse(JSON.stringify(dump));
      const edited = copy.data.water_intake.find((r) => r.id === target.id);
      edited.amount_ml = 777;
      edited.updated_at = new Date(Date.now() + 60000).toISOString();

      await store.importAll(copy, { mode: 'merge' });
      const after = await store.get('water_intake', target.id);
      if (after.amount_ml !== 777) throw new Error('победила устаревшая запись');

      const count = (await store.list('water_intake')).length;
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
    name: 'Уборка за собой',
    async run() {
      await store.wipe();
      const left = await store.list('water_intake', { includeDeleted: true });
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
