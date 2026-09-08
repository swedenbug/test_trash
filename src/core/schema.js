/*
  schema.js - описание таблиц и проверка записей.
  Назначение: единственное место, где сказано, из каких полей состоит запись
  и что считается допустимым значением.
  Зависимости: нет.
  Здесь нет хранения и нет интерфейса - только форма данных.
*/

export const SCHEMA_VERSION = 3;

/* Поля, общие для прикладных таблиц. Без них невозможно слияние устройств. */
const common = {
  id:         { type: 'id',        required: true },
  created_at: { type: 'timestamp', required: true },
  updated_at: { type: 'timestamp', required: true },
  deleted_at: { type: 'timestamp', nullable: true, default: null },
};

/*
  Таблицы движка тем. Границы и списки значений совпадают с server/schema.sql
  поле в поле. Расхождение здесь стоит дороже, чем кажется: запись пройдёт
  местную проверку и будет отвергнута сервером. Заход 1.5 научил это замечать -
  запись попадёт в список непринятых, - но безвредным не сделал.
*/
export const schema = {
  theme: {
    label: 'Темы',
    orderBy: 'sort',
    fields: {
      ...common,
      name:         { type: 'string', required: true },
      short:        { type: 'string', nullable: true, default: null },
      description:  { type: 'string', nullable: true, default: null },
      parent_id:    { type: 'id',     nullable: true, default: null },
      kind:         { type: 'enum',   required: true,
                      values: ['group', 'flag', 'count', 'time', 'scale', 'note'] },
      unit:         { type: 'string', nullable: true, default: null },
      // Пустота у направления и периода означает «неприменимо»: у группы
      // и у заметки нормы нет. Выдуманное умолчание однажды прочитали бы
      // как настоящее.
      direction:    { type: 'enum',   nullable: true, default: null,
                      values: ['at_least', 'at_most'] },
      goal_period:  { type: 'enum',   nullable: true, default: null,
                      values: ['day', 'week', 'none'] },
      urgency_kind: { type: 'enum',   required: true,
                      values: ['time_since', 'day_left', 'none'] },
      soft_after:   { type: 'int',    nullable: true, default: null, min: 0 },
      hard_after:   { type: 'int',    nullable: true, default: null, min: 0 },
      quick:        { type: 'json',   required: true, default: [], array: true },
      color:        { type: 'string', nullable: true, default: null },
      emblem:       { type: 'string', nullable: true, default: null },
      fill:         { type: 'enum',   nullable: true, default: null,
                      values: ['emblem_fill', 'emblem_solid', 'emblem_detailed',
                               'glyph', 'value', 'percent'] },
      sort:         { type: 'int',    required: true, default: 0 },
      active:       { type: 'bool',   required: true, default: true },
    },
  },

  theme_goal: {
    label: 'Нормы тем',
    orderBy: 'effective_from',
    fields: {
      ...common,
      theme_id:       { type: 'id',   required: true },
      value:          { type: 'int',  required: true, min: 1 },
      effective_from: { type: 'date', required: true },
    },
  },

  entry: {
    label: 'Записи',
    orderBy: 'at',
    fields: {
      ...common,
      theme_id:   { type: 'id',        required: true },
      at:         { type: 'timestamp', required: true },
      local_date: { type: 'date',      required: true },
      // Верхней границы нет: потолок в 5000 был правилом воды, а не общим.
      value:      { type: 'int',       required: true, min: 0 },
      source:     { type: 'enum',      required: true,
                    values: ['tap', 'hold', 'manual', 'timer', 'scenario'] },
      note:       { type: 'string',    nullable: true, default: null },
    },
    // Локальная дата выводится из момента записи, вручную её не задают.
    derive(rec, ctx) {
      if (!rec.local_date && rec.at) rec.local_date = localDate(rec.at, ctx.dayStartHour);
      return rec;
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

  /* Состояние обмена с сервером. На сервер не уезжает: адрес и пропуск
     привязаны к устройству, а курсоры у каждого устройства свои. */
  sync_state: {
    label: 'Состояние обмена',
    orderBy: 'id',
    fields: {
      id:         { type: 'id',        required: true },
      url:        { type: 'string',    nullable: true, default: null, max: 300 },
      token:      { type: 'string',    nullable: true, default: null, max: 300 },
      pulled_at:  { type: 'timestamp', nullable: true, default: null },
      pushed_at:  { type: 'timestamp', nullable: true, default: null },
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

/* Значения настроек по умолчанию. Хранилище может их не содержать -
   тогда берутся отсюда, а не из кода модулей. */
export const defaultSettings = {
  day_start_hour: 0,
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

    case 'bool':
      if (typeof value !== 'boolean') return `${name}: ожидалось да или нет`;
      break;

    case 'timestamp':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        return `${name}: ожидалась метка времени в формате ISO`;
      }
      break;

    case 'date':
      if (typeof value !== 'string' || !RE_DATE.test(value)) return `${name}: ожидалась дата ГГГГ-ММ-ДД`;
      break;

    /*
      Любое сериализуемое значение. Но если в схеме сказано `array`, форма
      проверяется здесь: у сервера на этой колонке стоит jsonb_typeof = 'array',
      и без проверки строка вместо массива прошла бы местную запись и вернулась
      отказом с сервера - то есть заметно, но с задержкой в один обмен.
    */
    case 'json':
      if (def.array && !Array.isArray(value)) return `${name}: ожидался массив`;
      break;

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

/* Что уезжает на сервер. Служебное и состояние обмена - не уезжают. */
export const SYNCED = ['theme', 'theme_goal', 'entry', 'settings'];
