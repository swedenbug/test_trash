/*
  water.js — тема «Водный баланс».
  Назначение: вся логика воды — запись, чтение, норма, срочность.
  Зависимости: store (передаётся снаружи), schema.js.

  Модуль не рисует и не слушает жесты. Он отвечает на вопросы оболочки
  по общим контрактам и умеет добавлять и убирать записи.
*/

import { localDate, nowIso } from '../core/schema.js';

export const TAP = 'tap';
export const HOLD = 'hold';
export const MANUAL = 'manual';

export function createWater(store) {
  const id = 'water';

  async function dayStart() {
    return store.setting('day_start_hour');
  }

  async function today() {
    return localDate(nowIso(), await dayStart());
  }

  /** Норма на дату: последняя запись, вступившая в силу не позже неё. */
  async function goalFor(date) {
    const rows = await store.list('water_goal');
    const fit = rows.filter((r) => r.effective_from <= date);
    if (fit.length) return fit[0].ml;              // список отсортирован по убыванию
    return store.setting('water.goal_ml');
  }

  async function intakesOn(date) {
    const rows = await store.list('water_intake');
    return rows.filter((r) => r.local_date === date);
  }

  /** Сколько выпито и сколько нужно за сегодня. */
  async function progress() {
    const date = await today();
    const rows = await intakesOn(date);
    const value = rows.reduce((sum, r) => sum + r.amount_ml, 0);
    return { date, value, goal: await goalFor(date), count: rows.length };
  }

  async function lastIntake() {
    const rows = await store.list('water_intake', { limit: 1 });
    return rows[0] ?? null;
  }

  return {
    id,
    title: 'Водный баланс',
    short: 'Вода',
    description: 'Ежедневная норма выпивания воды',
    unit: 'мл',
    color: 'var(--c-mod-water)',

    today, goalFor, progress, intakesOn, lastIntake,

    /** Записать приём. Возвращает созданную запись — её и отменяет таблетка. */
    async add(amountMl, source = TAP) {
      return store.put('water_intake', {
        at: nowIso(),
        amount_ml: Math.round(amountMl),
        source,
      });
    },

    /**
     * Задать дневную норму. Действует с сегодняшнего дня: прошлые дни
     * остаются посчитанными по той норме, что была тогда.
     */
    async setGoal(ml) {
      const date = await today();
      const rows = await store.list('water_goal');
      const sameDay = rows.find((r) => r.effective_from === date);
      return store.put('water_goal', sameDay
        ? { ...sameDay, ml: Math.round(ml) }
        : { ml: Math.round(ml), effective_from: date });
    },

    /** Норма на сегодня. */
    async goal() {
      return goalFor(await today());
    },

    remove: (recordId) => store.remove('water_intake', recordId),
    restore: (recordId) => store.restore('water_intake', recordId),

    /* --- Контракт 1: срочность --- */
    async getUrgency(now = new Date()) {
      const [{ value, goal }, last, soft, hard] = await Promise.all([
        progress(), lastIntake(),
        store.setting('water.soft_after_min'),
        store.setting('water.hard_after_min'),
      ]);

      // Записей нет вовсе — требовать нечего, это первый запуск.
      if (!last) {
        return { level: 'done', urgency: 0, since: null, fill: 0, value, goal,
                 summary: `0 из ${goal} мл` };
      }

      const since = Math.floor((now - new Date(last.at)) / 60000);
      let level = since < soft ? 'done' : since < hard ? 'soft' : 'hard';

      // Норма закрыта — выше мягкого уровня не поднимаемся.
      if (value >= goal && level === 'hard') level = 'soft';

      return {
        level,
        urgency: Math.min(1, since / hard),
        since,
        fill: value / goal,
        value, goal,
        summary: `${value} из ${goal} мл`,
      };
    },

    /* --- Контракт 2: лента записей --- */
    async getRecent(since) {
      const rows = await store.list('water_intake', { from: since });
      return rows.map((r) => ({
        id: r.id,
        moduleId: id,
        at: r.at,
        title: `${r.amount_ml} мл`,
        detail: { tap: 'тап', hold: 'удержание', manual: 'вручную' }[r.source] ?? r.source,
      }));
    },

    removeRecord: (recordId) => store.remove('water_intake', recordId),
    restoreRecord: (recordId) => store.restore('water_intake', recordId),

    /* --- Данные для карточки --- */
    async series() {
      const date = await today();
      const rows = (await intakesOn(date)).slice().reverse();   // по возрастанию времени

      let sum = 0;
      const cumulative = rows.map((r) => {
        sum += r.amount_ml;
        const d = new Date(r.at);
        return { hour: d.getHours() + d.getMinutes() / 60, ml: sum };
      });

      return { cumulative, week: await week(), weekCumulative: await weekCumulative() };
    },
  };

  async function weekDates() {
    const end = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(end);
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
  }

  async function week() {
    const days = await weekDates();
    const names = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const out = [];
    for (const d of days) {
      const date = localDate(d.toISOString(), await dayStart());
      const rows = await intakesOn(date);
      const ml = rows.reduce((s, r) => s + r.amount_ml, 0);
      out.push({ day: names[d.getDay()], pct: Math.round((ml / await goalFor(date)) * 100),
                 today: date === await today() });
    }
    return out;
  }

  async function weekCumulative() {
    const days = await weekDates();
    const names = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    let sum = 0;
    const out = [];
    for (const d of days) {
      const date = localDate(d.toISOString(), await dayStart());
      const rows = await intakesOn(date);
      sum += rows.reduce((s, r) => s + r.amount_ml, 0);
      out.push({ day: names[d.getDay()], ml: sum });
    }
    return out;
  }
}
