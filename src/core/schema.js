/*
  schema.js — описание таблиц и проверка записей.
  Назначение: единственное место, где сказано, из каких полей состоит запись
  и что считается допустимым значением.
  Зависимости: нет.
  Здесь нет хранения и нет интерфейса — только форма данных.
*/

export const SCHEMA_VERSION = 1;

/* Поля, общие для прикладных таблиц. Без них невозможно слияние устройств. */
const common = {
  id:         { type: 'id',        required: true },
  created_at: { type: 'timestamp', required: true },
  updated_at: { type: 'timestamp', required: true },
  deleted_at: { type: 'timestamp', nullable: true, default: null },
};

export const schema = {
  water_intake: {
    label: 'Приёмы воды',
    orderBy: 'at',
    fields: {
      ...common,
      at:         { type: 'timestamp', required: true },
      local_date: { type: 'date',      required: true },
      amount_ml:  { type: 'int',       required: true, min: 1, max: 5000 },
      source:     { type: 'enum',      required: true, values: ['tap', 'hold', 'manual'] },
      note:       { type: 'string',    nullable: true, default: null, max: 500 },
    },
    // Локальная дата выводится из момента приёма, вручную её не задают.
    derive(rec, ctx) {
      if (!rec.local_date && rec.at) rec.local_date = localDate(rec.at, ctx.dayStartHour);
      return rec;
    },
  },

  water_goal: {
    label: 'Норма воды',
    orderBy: 'effective_from',
    fields: {
      ...common,
      ml:             { type: 'int',  required: true, min: 200, max: 10000 },
      effective_from: { type: 'date', required: true },
    },
  },

  settings: {
    label: 'Настройки',
    orderBy: 'id',
    fields: {
      id:         { type: 'id',        required: true },  // ключ настройки
      value:      { type: 'json',      required: true },
      updated_at: { type: 'timestamp', required: true },
    },
  },

  meta: {
    label: 'Служебное',
    orderBy: 'id',
    fields: {
      id:             { type: 'id',        required: true },
      schema_version: { type: 'int',       required: true, min: 1 },
      device_id:      { type: 'string',    required: true },
      updated_at:     { type: 'timestamp', required: true },
    },
  },
};

/* Значения настроек по умолчанию. Хранилище может их не содержать —
   тогда берутся отсюда, а не из кода модулей. */
export const defaultSettings = {
  day_start_hour:       0,
  'water.tap_ml':       250,
  'water.hold_ml':      1000,
  'water.soft_after_min': 72,
  'water.hard_after_min': 180,
  'water.goal_ml':      2500,   // пока норма не задана явно в water_goal
};

/* ------------------------------------------------------------------ */
/* Утилиты                                                             */
/* ------------------------------------------------------------------ */

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // Запасной путь для старых движков: тот же формат, худшая случайность.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function nowIso() {
  return new Date().toISOString();
}

/* Локальная дата с учётом границы суток. Возвращает 'ГГГГ-ММ-ДД'. */
export function localDate(iso, dayStartHour = 0) {
  const d = new Date(iso);
  d.setHours(d.getHours() - dayStartHour);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ------------------------------------------------------------------ */
/* Проверка                                                            */
/* ------------------------------------------------------------------ */

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkField(name, def, value) {
  const missing = value === undefined || value === null;

  if (missing) {
    if (def.required) return `${name}: обязательное поле не заполнено`;
    return null;                       // null допустим для необязательных
  }

  switch (def.type) {
    case 'id':
    case 'string':
      if (typeof value !== 'string' || value === '') return `${name}: ожидалась непустая строка`;
      if (def.max && value.length > def.max) return `${name}: длиннее ${def.max} символов`;
      break;

    case 'int':
      if (!Number.isInteger(value)) return `${name}: ожидалось целое число`;
      if (def.min !== undefined && value < def.min) return `${name}: меньше ${def.min}`;
      if (def.max !== undefined && value > def.max) return `${name}: больше ${def.max}`;
      break;

    case 'enum':
      if (!def.values.includes(value)) return `${name}: недопустимое значение «${value}»`;
      break;

    case 'timestamp':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        return `${name}: ожидалась метка времени в формате ISO`;
      }
      break;

    case 'date':
      if (typeof value !== 'string' || !RE_DATE.test(value)) return `${name}: ожидалась дата ГГГГ-ММ-ДД`;
      break;

    case 'json':
      break;                            // любое сериализуемое значение

    default:
      return `${name}: неизвестный тип поля «${def.type}»`;
  }

  return null;
}

/** Проверяет запись целиком. Возвращает { ok, errors }. */
export function validate(collection, record) {
  const table = schema[collection];
  if (!table) return { ok: false, errors: [`неизвестная таблица «${collection}»`] };

  const errors = [];

  for (const [name, def] of Object.entries(table.fields)) {
    const problem = checkField(name, def, record[name]);
    if (problem) errors.push(problem);
  }

  for (const name of Object.keys(record)) {
    if (!table.fields[name]) errors.push(`${name}: поле не описано в схеме`);
  }

  return { ok: errors.length === 0, errors };
}

/** Дополняет запись служебными полями и значениями по умолчанию. */
export function normalize(collection, input, ctx = {}) {
  const table = schema[collection];
  if (!table) throw new Error(`неизвестная таблица «${collection}»`);

  const rec = { ...input };
  const now = nowIso();

  if (table.fields.id && !rec.id) rec.id = newId();
  if (table.fields.created_at && !rec.created_at) rec.created_at = now;
  if (table.fields.updated_at) rec.updated_at = now;

  for (const [name, def] of Object.entries(table.fields)) {
    if (rec[name] === undefined && 'default' in def) rec[name] = def.default;
  }

  if (table.derive) table.derive(rec, { dayStartHour: ctx.dayStartHour ?? 0 });

  return rec;
}

export const collections = Object.keys(schema);
