/*
  store.js — единственная точка доступа к данным.
  Назначение: приём, проверка, хранение и выдача записей. Модули не знают,
  где данные лежат физически.
  Зависимости: schema.js, любой адаптер.

  Все методы асинхронные. Удаление всегда мягкое.
*/

import {
  schema, collections, validate, normalize, nowIso,
  SCHEMA_VERSION, defaultSettings,
} from './schema.js';

export function createStore(adapter) {
  const listeners = new Map();          // таблица → набор обработчиков
  let settingsCache = null;

  function notify(collection) {
    const set = listeners.get(collection);
    if (!set) return;
    for (const fn of set) {
      try { fn(collection); } catch (e) { console.error('подписчик упал:', e); }
    }
  }

  function requireTable(collection) {
    if (!schema[collection]) throw new Error(`неизвестная таблица «${collection}»`);
    return schema[collection];
  }

  const api = {
    adapterName: adapter.name,

    /* --- чтение --------------------------------------------------- */

    async list(collection, { from, to, includeDeleted = false, limit } = {}) {
      const table = requireTable(collection);
      let rows = await adapter.readAll(collection);

      if (!includeDeleted) rows = rows.filter((r) => !r.deleted_at);

      const field = table.orderBy;
      if (from) rows = rows.filter((r) => r[field] >= from);
      if (to)   rows = rows.filter((r) => r[field] <= to);

      rows.sort((a, b) => (a[field] < b[field] ? 1 : a[field] > b[field] ? -1 : 0));

      return limit ? rows.slice(0, limit) : rows;
    },

    async get(collection, id) {
      requireTable(collection);
      const rows = await adapter.readAll(collection);
      return rows.find((r) => r.id === id) ?? null;
    },

    async count(collection, opts) {
      return (await api.list(collection, opts)).length;
    },

    /* --- запись --------------------------------------------------- */

    async put(collection, input) {
      requireTable(collection);
      const ctx = { dayStartHour: await api.setting('day_start_hour') };
      const rec = normalize(collection, input, ctx);

      const { ok, errors } = validate(collection, rec);
      if (!ok) throw new Error(`запись не прошла проверку — ${errors.join('; ')}`);

      await adapter.upsert(collection, rec);
      if (collection === 'settings') settingsCache = null;
      notify(collection);
      return rec;
    },

    /** Мягкое удаление: запись остаётся, но помечена и не попадает в списки. */
    async remove(collection, id) {
      requireTable(collection);
      const rec = await api.get(collection, id);
      if (!rec) return null;
      if (!('deleted_at' in schema[collection].fields)) {
        throw new Error(`таблица «${collection}» не поддерживает удаление`);
      }

      const marked = { ...rec, deleted_at: nowIso(), updated_at: nowIso() };
      await adapter.upsert(collection, marked);
      notify(collection);
      return marked;
    },

    /** Возврат ошибочно удалённой записи. Используется таблеткой отмены. */
    async restore(collection, id) {
      requireTable(collection);
      const rec = await api.get(collection, id);
      if (!rec) return null;
      const back = { ...rec, deleted_at: null, updated_at: nowIso() };
      await adapter.upsert(collection, back);
      notify(collection);
      return back;
    },

    /* --- настройки ------------------------------------------------ */

    async setting(key) {
      if (!settingsCache) {
        const rows = await adapter.readAll('settings');
        settingsCache = Object.fromEntries(rows.map((r) => [r.id, r.value]));
      }
      return settingsCache[key] ?? defaultSettings[key];
    },

    async setSetting(key, value) {
      return api.put('settings', { id: key, value });
    },

    /* --- подписка ------------------------------------------------- */

    onChange(collection, handler) {
      if (!listeners.has(collection)) listeners.set(collection, new Set());
      listeners.get(collection).add(handler);
      return () => listeners.get(collection).delete(handler);
    },

    /* --- перенос данных ------------------------------------------- */

    async exportAll() {
      const data = {};
      for (const c of collections) data[c] = await adapter.readAll(c);
      return {
        format: 'progress-export',
        schema_version: SCHEMA_VERSION,
        exported_at: nowIso(),
        data,
      };
    },

    /**
     * mode: 'replace' — заменить всё,
     *       'merge'   — победит запись с более поздним updated_at.
     */
    async importAll(dump, { mode = 'merge' } = {}) {
      if (dump?.format !== 'progress-export') throw new Error('файл не похож на выгрузку приложения');
      if (dump.schema_version > SCHEMA_VERSION) {
        throw new Error('файл сделан более новой версией приложения');
      }

      let added = 0;
      for (const c of collections) {
        const incoming = dump.data?.[c] ?? [];

        if (mode === 'replace') {
          await adapter.writeAll(c, incoming);
          added += incoming.length;
        } else {
          const current = await adapter.readAll(c);
          const byId = new Map(current.map((r) => [r.id, r]));
          for (const r of incoming) {
            const mine = byId.get(r.id);
            if (!mine || (r.updated_at ?? '') > (mine.updated_at ?? '')) {
              byId.set(r.id, r);
              added++;
            }
          }
          await adapter.writeAll(c, [...byId.values()]);
        }
        notify(c);
      }
      settingsCache = null;
      return { added };
    },

    /* --- служебное ------------------------------------------------ */

    async usage() {
      return adapter.usage ? adapter.usage(collections) : null;
    },

    async wipe() {
      for (const c of collections) await adapter.drop(c);
      settingsCache = null;
      for (const c of collections) notify(c);
    },
  };

  return api;
}
