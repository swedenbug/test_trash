/*
  adapter-local.js — хранение в браузере.
  Назначение: реализация интерфейса адаптера поверх localStorage.
  Зависимости: нет.

  Одна таблица — один ключ, значение — массив записей в JSON.
  Методы асинхронные, хотя хранилище синхронное: интерфейс должен совпадать
  с будущим сетевым адаптером, иначе переезд перепишет все модули.
*/

const DEFAULT_PREFIX = 'pr:v1:';

export function createLocalAdapter({ prefix = DEFAULT_PREFIX } = {}) {
  const keyOf = (collection) => prefix + collection;

  function readRaw(collection) {
    let raw;
    try {
      raw = localStorage.getItem(keyOf(collection));
    } catch (e) {
      throw new Error('хранилище браузера недоступно');
    }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      // Битый JSON молча не проглатываем: тихая потеря данных хуже явной ошибки.
      throw new Error(`повреждены данные таблицы «${collection}»`);
    }
  }

  function writeRaw(collection, rows) {
    try {
      localStorage.setItem(keyOf(collection), JSON.stringify(rows));
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        throw new Error('хранилище браузера переполнено');
      }
      throw e;
    }
  }

  return {
    name: 'local',

    async readAll(collection) {
      return readRaw(collection);
    },

    async writeAll(collection, rows) {
      writeRaw(collection, rows);
    },

    async upsert(collection, record) {
      const rows = readRaw(collection);
      const i = rows.findIndex((r) => r.id === record.id);
      if (i === -1) rows.push(record);
      else rows[i] = record;
      writeRaw(collection, rows);
      return record;
    },

    async drop(collection) {
      try {
        localStorage.removeItem(keyOf(collection));
      } catch (e) {
        throw new Error('хранилище браузера недоступно');
      }
    },

    /** Занятый объём в байтах — приблизительно, по длине строк. */
    async usage(collectionList) {
      let bytes = 0;
      for (const c of collectionList) {
        const raw = localStorage.getItem(keyOf(c));
        if (raw) bytes += raw.length * 2;   // UTF-16
      }
      return bytes;
    },
  };
}
