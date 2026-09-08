/*
  engine.js - движок тем.
  Назначение: вся логика любой темы - запись, норма, прогресс, срочность, лента.
  Зависимости: store (передаётся снаружи), schema.js.

  Один модуль на все темы. Раньше тема была написана вручную - `water.js`, -
  и оболочка знала про воду. Теперь оболочка не знает ни одной темы: она
  спрашивает движок и рисует ответ.

  Движок не рисует и не слушает жесты. Разметки он не знает вовсе.
*/

import { localDate, nowIso } from '../core/schema.js';

export const TAP = 'tap';
export const HOLD = 'hold';
export const MANUAL = 'manual';

/* Виды тем, у которых запись - величина. Флажок, оценка и заметка считаются иначе. */
const NUMERIC = ['count', 'time'];

/*
  Потолок оценки задан видом, а не нормой: шкала - это всегда «от одного
  до десяти», и заводить под неё запись в theme_goal было бы выдумыванием
  нормы там, где её нет. Отсюда `ceiling` в срочности: норма - это `goal`,
  а `ceiling` - то, относительно чего показывают значение.
*/
const SCALE_MAX = 10;

/*
  Порог срочности задан, только если это число.

  Проверять «не равно null» недостаточно: отсутствующее поле даёт `undefined`,
  сравнение с ним всегда ложно, и уровень тихо остаётся мягким - порог `soft`
  виден, `hard` не наступает никогда. Отказ при этом выглядит как работа.
*/
const threshold = (v) => (Number.isFinite(v) ? v : null);

export function createEngine(store) {
  async function dayStart() {
    return store.setting('day_start_hour');
  }

  async function today() {
    return localDate(nowIso(), await dayStart());
  }

  async function entriesOn(themeId, date) {
    const rows = await store.list('entry');
    return rows.filter((r) => r.theme_id === themeId && r.local_date === date);
  }

  async function lastEntry(themeId) {
    const rows = await store.list('entry');
    return rows.find((r) => r.theme_id === themeId) ?? null;   // список свежими вперёд
  }

  /* Минут до конца суток с учётом их границы. */
  function minutesLeftToday(now, startHour) {
    const end = new Date(now);
    end.setHours(startHour, 0, 0, 0);
    if (end <= now) end.setDate(end.getDate() + 1);
    return Math.floor((end - now) / 60000);
  }

  function shortText(s, max = 24) {
    const t = String(s ?? '').trim();
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
  }

  /* Величина записи словами. Не длиннее 24 символов: это подпись, а не рассказ. */
  function titleOf(theme, entry) {
    switch (theme.kind) {
      case 'time': {
        const m = Math.round(entry.value / 60);
        if (m < 60) return `${m} мин`;
        const h = Math.floor(m / 60);
        return `${h} ч${m % 60 ? ` ${m % 60} мин` : ''}`;
      }
      case 'flag':  return 'отмечено';
      case 'scale': return `${entry.value} из 10`;
      case 'note':  return shortText(entry.note || 'заметка');
      default:      return shortText(`${entry.value}${theme.unit ? ` ${theme.unit}` : ''}`);
    }
  }

  const api = {
    /*
      Активные темы по возрастанию sort. Группы не попадают: у группы нет
      собственных записей, её кружок считается из детей - решение отложено
      до захода после пятого.
    */
    async list() {
      const rows = await store.list('theme');
      return rows
        .filter((t) => t.active && t.kind !== 'group')
        .sort((a, b) => a.sort - b.sort);
    },

    get(themeId) {
      return store.get('theme', themeId);
    },

    /* --- норма ---------------------------------------------------- */

    /** Норма на дату: последняя запись, вступившая в силу не позже неё. */
    async goalFor(themeId, date) {
      const rows = await store.list('theme_goal');
      const fit = rows.find((r) => r.theme_id === themeId && r.effective_from <= date);
      return fit ? fit.value : null;          // нормы может не быть вовсе
    },

    /**
     * Задать норму. Действует с указанной даты, по умолчанию с сегодняшней:
     * прошлые дни остаются посчитанными по той норме, что была тогда.
     */
    async setGoal(themeId, value, fromDate) {
      const date = fromDate ?? await today();
      const rows = await store.list('theme_goal');
      const sameDay = rows.find((r) => r.theme_id === themeId && r.effective_from === date);

      return store.put('theme_goal', sameDay
        ? { ...sameDay, value: Math.round(value) }
        : { theme_id: themeId, value: Math.round(value), effective_from: date });
    },

    /* --- прогресс ------------------------------------------------- */

    /**
     * Сколько сделано за день и чем это считается.
     *
     * `at_least` закрывается в момент достижения нормы. `at_most` пока день идёт
     * остаётся `idle`, даже если норма ещё не тронута: успех у темы «не более»
     * не может наступить заранее, иначе он отменялся бы задним числом.
     *
     * Превышение - `broken`. Считается по живым записям: снятая отмена в счёт
     * не идёт, иначе случайный тап, отменённый через две секунды, портил бы
     * день навсегда - против правила «всё восстановимо».
     */
    async progress(themeId, date) {
      const theme = await api.get(themeId);
      const day = date ?? await today();
      const rows = await entriesOn(themeId, day);

      /*
        Оценка не складывается. Две оценки за день - это не «двенадцать»,
        а последняя из них: настроение переоценили, а не накопили.
        Список идёт свежими вперёд, поэтому берётся первая строка.
      */
      const value = theme?.kind === 'scale'
        ? (rows[0]?.value ?? 0)
        : rows.reduce((sum, r) => sum + r.value, 0);

      const goal = await api.goalFor(themeId, day);
      const ratio = goal ? value / goal : 0;

      let state = 'idle';
      if (goal !== null && theme?.direction === 'at_most') {
        if (value > goal) state = 'broken';
        else if (day < await today()) state = 'done';
      } else if (goal !== null && value >= goal) {
        state = 'done';
      }

      return { date: day, value, goal, ratio, state, count: rows.length };
    },

    /* --- контракт 1: срочность ------------------------------------ */

    async getUrgency(themeId, now = new Date()) {
      const theme = await api.get(themeId);
      const { value, goal, ratio, state } = await api.progress(themeId);
      const unit = theme?.unit ? ` ${theme.unit}` : '';

      /* Относительно чего показывать значение: норма, а у шкалы - её потолок. */
      const ceiling = goal ?? (theme?.kind === 'scale' ? SCALE_MAX : null);
      const summary = ceiling === null
        ? `${value}${unit}`
        : `${value} из ${ceiling}${unit}`;

      const fill = ceiling ? value / ceiling : ratio;

      const base = { urgency: 0, since: null, fill, value, goal, ceiling, state, summary };

      if (!theme || theme.urgency_kind === 'none') {
        return { ...base, level: 'done' };
      }

      if (theme.urgency_kind === 'day_left') {
        const left = minutesLeftToday(now, await dayStart());
        const soft = threshold(theme.soft_after);
        const hard = threshold(theme.hard_after);

        // Норма закрыта - торопить не за чем.
        if (state === 'done' || (goal !== null && value >= goal)) {
          return { ...base, level: 'done', since: left };
        }

        let level = 'done';
        if (hard !== null && left < hard) level = 'hard';
        else if (soft !== null && left < soft) level = 'soft';

        return { ...base, level, since: left,
                 urgency: soft ? Math.min(1, 1 - left / soft) : 0 };
      }

      /* time_since */
      const last = await lastEntry(themeId);

      // Записей нет вовсе - требовать нечего, это первый запуск темы.
      if (!last) return { ...base, level: 'done' };

      const since = Math.floor((now - new Date(last.at)) / 60000);
      const soft = threshold(theme.soft_after);
      const hard = threshold(theme.hard_after);

      let level = 'done';
      if (hard !== null && since >= hard) level = 'hard';
      else if (soft !== null && since >= soft) level = 'soft';

      // Норма закрыта - выше мягкого уровня не поднимаемся.
      if (goal !== null && value >= goal && level === 'hard') level = 'soft';

      return { ...base, level, since,
               urgency: hard ? Math.min(1, since / hard) : 0 };
    },

    /* --- записи --------------------------------------------------- */

    /**
     * Записать величину. Возвращает `{ record, removed }`: у флажка повторный
     * тап снимает отметку, а не пишет вторую, и таблетка отмены должна знать,
     * что именно откатывать.
     */
    async add(themeId, value, source = TAP, note = null) {
      const theme = await api.get(themeId);
      if (!theme) throw new Error('темы не существует');

      if (theme.kind === 'flag') {
        const [already] = await entriesOn(themeId, await today());
        if (already) {
          await store.remove('entry', already.id);
          return { record: already, removed: true };
        }
        return { record: await store.put('entry', { theme_id: themeId, at: nowIso(), value: 1, source }),
                 removed: false };
      }

      const amount = NUMERIC.includes(theme.kind) ? Math.round(value) : value;
      const record = await store.put('entry', {
        theme_id: themeId, at: nowIso(), value: amount, source, note,
      });
      return { record, removed: false };
    },

    /** Записи темы за дату. Экран темы показывает ими сегодняшний день. */
    entriesOn,

    /**
     * Ряды для графиков. Ключи `ml` и `pct` исторические: chart.js получил их
     * во времена единственной темы и с тех пор не знает, что рисует.
     *
     * У темы «не более» ряды те же самые. Разница не в графике, а в том, что
     * пересечение нормы означает нарушение, а не успех, - и говорится это
     * словами, а не линией.
     */
    async series(themeId) {
      const start = await dayStart();
      const day = await today();

      const rows = (await entriesOn(themeId, day)).slice().reverse();   // по возрастанию времени
      let sum = 0;
      const cumulative = rows.map((r) => {
        sum += r.value;
        const d = new Date(r.at);
        return { hour: d.getHours() + d.getMinutes() / 60, ml: sum };
      });

      const names = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });

      const week = [];
      const weekCumulative = [];
      let running = 0;

      for (const d of days) {
        const date = localDate(d.toISOString(), start);
        const total = (await entriesOn(themeId, date)).reduce((s, r) => s + r.value, 0);
        const goal = await api.goalFor(themeId, date);

        week.push({ day: names[d.getDay()], today: date === day,
                    pct: goal ? Math.round((total / goal) * 100) : 0 });
        running += total;
        weekCumulative.push({ day: names[d.getDay()], ml: running });
      }

      return { cumulative, week, weekCumulative };
    },

    remove: (recordId) => store.remove('entry', recordId),
    restore: (recordId) => store.restore('entry', recordId),

    /** Подпись для таблетки отмены: величина, а не действие. */
    async labelFor(themeId, record) {
      const theme = await api.get(themeId);
      return titleOf(theme ?? {}, record);
    },

    /* --- контракт 2: лента записей -------------------------------- */

    async getRecent(since) {
      const rows = await store.list('entry', { from: since });
      const themes = new Map((await store.list('theme')).map((t) => [t.id, t]));

      return rows.map((r) => {
        const theme = themes.get(r.theme_id);
        return {
          id: r.id,
          moduleId: r.theme_id,
          at: r.at,
          title: titleOf(theme ?? {}, r),
          detail: { tap: 'тап', hold: 'удержание', manual: 'вручную',
                    timer: 'таймер', scenario: 'сценарий' }[r.source] ?? r.source,
        };
      });
    },

    removeRecord: (recordId) => store.remove('entry', recordId),
    restoreRecord: (recordId) => store.restore('entry', recordId),
  };

  return api;
}
