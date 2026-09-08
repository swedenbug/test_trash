/*
  theme-form.js - форма создания и правки темы.
  Назначение: завести тему без консоли и поправить заведённую.
  Зависимости: engine (движок), circle.js, emblems.js.

  Форма ничего не пишет в хранилище сама - только через движок. Проверки
  тоже там: что считается допустимой темой, знает предметная область,
  а не разметка. Иначе второй способ заведения обошёл бы правила молча.

  Поля идут по шагам. Пятнадцать полей одной простынёй не помещаются
  и не нужны сразу, а форма из пятнадцати строк отталкивает раньше,
  чем человек дойдёт до первой темы.
*/

import { circleSvg } from './circle.js';
import { EMBLEMS, EMBLEM_IDS, emblemSvg, DETAILS, DETAIL_IDS, detailSvg } from './emblems.js';

/*
  Названия видов подобраны так, чтобы их не приходилось объяснять.
  Группы в списке нет: заводить их пока нельзя, решение отложено.
*/
const KINDS = [
  { id: 'flag',  name: 'Да или нет',
    hint: 'Отметка о выполнении. Кружок либо заполнен целиком, либо пуст' },
  { id: 'count', name: 'Количество',
    hint: 'Число в своих единицах: миллилитры, калории, шаги, повторы' },
  { id: 'time',  name: 'Время',
    hint: 'Минуты и часы: чтение, тренировка, время в телефоне' },
  { id: 'scale', name: 'Оценка от 1 до 10',
    hint: 'Балл за день. Потолок задан видом, норма не нужна' },
  { id: 'note',  name: 'Запись',
    hint: 'Текст без величины: мысль, вывод, событие' },
];

const CONTENTS = [
  { id: 'emblem_fill',     name: 'Знак с заливкой', hint: 'Заполняется снизу вверх по мере выполнения' },
  { id: 'emblem_solid',    name: 'Знак целиком',    hint: 'Сплошной силуэт, заливки нет' },
  { id: 'emblem_detailed', name: 'Подробный знак',  hint: 'Линиями: бег, велосипед, мишень' },
  { id: 'glyph',           name: 'Буква или цифра', hint: 'До двух символов' },
  { id: 'value',           name: 'Число и норма',   hint: 'Например, 10 из 90' },
  { id: 'percent',         name: 'Процент',         hint: 'Доля выполненного' },
];

const URGENCY = [
  { id: 'time_since', name: 'По времени с последнего раза' },
  { id: 'day_left',   name: 'По остатку дня' },
  { id: 'none',       name: 'Не подгонять' },
];

/* Холодная половина круга плюс приглушённый песочный: тёплая занята системой. */
const COLORS = [
  '#58b6ee', '#38d0e8', '#17b8c4', '#5b7cf5',
  '#a78bfa', '#d46ce8', '#f472b6', '#c9b070',
];

/* Что спрашивать при каждом виде. Список полей - тоже данные. */
const FIELDS = {
  flag:  ['goal_period', 'urgency', 'look'],
  count: ['unit', 'direction', 'goal', 'goal_period', 'quick', 'urgency', 'look'],
  time:  ['direction', 'goal', 'goal_period', 'quick', 'urgency', 'look'],
  scale: ['urgency', 'look'],
  note:  ['look'],
};

/* Наполнения, бессмысленные для вида: заливка без нормы ничего не показывает. */
const CONTENT_OFF = {
  flag:  ['value', 'percent'],
  scale: ['emblem_fill', 'value', 'percent'],
  note:  ['emblem_fill', 'value', 'percent'],
};

const STEPS = [
  { n: 1, title: 'Что отслеживаем', has: () => true },
  { n: 2, title: 'Норма',    has: (f) => f.some((x) => ['unit', 'direction', 'goal', 'goal_period'].includes(x)) },
  { n: 3, title: 'Ввод',     has: (f) => f.includes('quick') },
  { n: 4, title: 'Срочность', has: (f) => f.includes('urgency') },
  { n: 5, title: 'Вид кружка', has: (f) => f.includes('look') },
];

const SHORT_MAX = 12;

/* Знак хранится строкой с указанием набора: silhouette:drop, detailed:run, char:Ф. */
function packEmblem(state) {
  if (state.content === 'glyph') return `char:${state.letter || ''}`;
  if (state.content === 'emblem_detailed') return `detailed:${state.emblem}`;
  return `silhouette:${state.emblem}`;
}

function unpackEmblem(theme) {
  const [set, name] = String(theme.emblem ?? '').split(':');
  return {
    emblem: set === 'char' ? 'drop' : (name || 'drop'),
    letter: set === 'char' ? (name || '') : '',
  };
}

export function createThemeForm({ engine, onSaved }) {
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.hidden = true;
  el.innerHTML = `
    <div class="sheet-back"></div>
    <section class="sheet-panel">
      <header class="sheet-panel__head">
        <h2 id="tf-head">Новая тема</h2>
        <button class="sheet-panel__close" type="button" aria-label="Закрыть">✕</button>
      </header>

      <div class="tf">
        <div class="tf__preview" id="tf-preview"></div>
        <div class="tf__body" id="tf-body"></div>
      </div>

      <p class="manual__err" id="tf-err" hidden></p>

      <div class="m-actions m-actions--wide">
        <button class="btn" id="tf-back" type="button">Назад</button>
        <button class="btn btn--main" id="tf-next" type="button">Далее</button>
      </div>
    </section>`;

  const $ = (s) => el.querySelector(s);
  const close = () => { el.hidden = true; };

  let state = null;
  let editing = null;      // правим существующую тему либо заводим новую
  let step = 1;

  function say(text) {
    $('#tf-err').textContent = text ?? '';
    $('#tf-err').hidden = !text;
  }

  function blank() {
    return {
      name: '', short: '', description: '',
      kind: 'count', unit: '', direction: 'at_least',
      goal: null, goal_period: 'day', quick: [],
      urgency_kind: 'time_since', soft_after: null, hard_after: null,
      active: true,
      color: COLORS[0], emblem: 'drop', content: 'emblem_fill', letter: '',
      allSigns: false,
    };
  }

  async function fromTheme(theme) {
    const { emblem, letter } = unpackEmblem(theme);
    return {
      name: theme.name ?? '', short: theme.short ?? '', description: theme.description ?? '',
      kind: theme.kind, unit: theme.unit ?? '',
      direction: theme.direction ?? 'at_least',
      goal: await engine.goalFor(theme.id, new Date().toISOString().slice(0, 10)),
      goal_period: theme.goal_period ?? 'day',
      quick: Array.isArray(theme.quick) ? [...theme.quick] : [],
      urgency_kind: theme.urgency_kind ?? 'none',
      soft_after: theme.soft_after, hard_after: theme.hard_after,
      active: theme.active !== false,
      color: theme.color ?? COLORS[0],
      emblem, letter,
      content: theme.fill ?? 'emblem_fill',
      allSigns: false,
    };
  }

  const fields = () => FIELDS[state.kind] ?? [];
  const steps = () => STEPS.filter((s) => s.has(fields()));

  /* ---------- предпросмотр ---------- */

  function drawPreview() {
    const goal = state.kind === 'scale' ? 10 : (state.goal || 1);
    const shown = Math.round(goal * 0.45);

    $('#tf-preview').innerHTML = `
      <div class="tf__ring">
        ${circleSvg({ size: 76, level: state.urgency_kind === 'none' ? 'done' : 'soft',
                      fill: shown / goal, color: state.color, emblem: state.emblem,
                      content: state.content.replace('emblem_', '').replace('detailed', 'detail')
                                 .replace('glyph', 'letter'),
                      text: state.letter, value: shown, goal })}
        <span class="tf__ringlabel">${state.short || state.name || 'Тема'}</span>
      </div>
      <div class="tf__sum">
        <b>${state.name || 'Без названия'}</b>
        <span>${summary()}</span>
      </div>`;
  }

  function summary() {
    const kind = KINDS.find((k) => k.id === state.kind)?.name ?? state.kind;
    const parts = [kind];
    if (state.goal) parts.push(`норма ${state.goal}${state.unit ? ` ${state.unit}` : ''}`);
    if (state.quick.length) parts.push(`ввод ${state.quick.join(', ')}`);
    return parts.join(' · ');
  }

  /* ---------- поля ---------- */

  const seg = (act, list, current) => `<div class="seg">${
    list.map((o) => `<button class="seg__b${o.id === current ? ' is-on' : ''}"
        type="button" data-act="${act}" data-value="${o.id}"
        ${o.off ? 'disabled' : ''}>${o.name}</button>`).join('')
  }</div>`;

  function stepBody() {
    const f = fields();

    if (step === 1) {
      return `
        <div class="blk">
          <div class="field">
            <label class="field__label" for="tf-name">Название</label>
            <input class="manual__input" id="tf-name" data-act="name" type="text"
                   value="${state.name}" placeholder="Например, Водный баланс">
          </div>
          <div class="field">
            <div class="field__top">
              <label class="field__label" for="tf-short">Подпись под кружком</label>
              <span class="field__count" data-count="short">${state.short.length} / ${SHORT_MAX}</span>
            </div>
            <input class="manual__input" id="tf-short" data-act="short" type="text"
                   maxlength="${SHORT_MAX}" data-max="${SHORT_MAX}" value="${state.short}">
            <p class="field__hint">Длиннее не помещается под кружком.</p>
          </div>
          <div class="field">
            <label class="field__label" for="tf-desc">Описание</label>
            <input class="manual__input" id="tf-desc" data-act="description" type="text"
                   value="${state.description}" placeholder="Строка в карточке">
          </div>
        </div>
        <div class="blk">
          <h3 class="blk__title">Вид <span>${editing ? 'после создания не меняется' : ''}</span></h3>
          ${seg('kind', KINDS.map((k) => ({ ...k, off: Boolean(editing) })), state.kind)}
          <p class="field__hint">${KINDS.find((k) => k.id === state.kind)?.hint ?? ''}</p>
        </div>
        ${editing ? `
        <div class="blk">
          <h3 class="blk__title">Тема в работе</h3>
          ${seg('active', [{ id: 'on', name: 'Включена' }, { id: 'off', name: 'Выключена' }],
                state.active ? 'on' : 'off')}
          <p class="field__hint">Выключенная тема уходит из ряда и из ленты, записи
            остаются целыми. Удаления нет: у записей есть история, и стирать её
            заодно с темой - решение, которое не отыграть.</p>
        </div>` : ''}`;
    }

    if (step === 2) {
      const rows = [];
      if (f.includes('unit')) rows.push(`
        <div class="field">
          <label class="field__label" for="tf-unit">Единица</label>
          <input class="manual__input" id="tf-unit" data-act="unit" type="text"
                 value="${state.unit}" placeholder="мл, шаги, повторы" ${editing ? 'disabled' : ''}>
          ${editing ? '<p class="field__hint">После создания не меняется: записи уже в этих единицах.</p>' : ''}
        </div>`);
      if (f.includes('direction')) rows.push(`
        <div class="field">
          <label class="field__label">Направление</label>
          ${seg('direction', [{ id: 'at_least', name: 'Не менее' }, { id: 'at_most', name: 'Не более' }], state.direction)}
        </div>`);
      if (f.includes('goal')) rows.push(`
        <div class="field">
          <label class="field__label" for="tf-goal">Норма</label>
          <input class="manual__input" id="tf-goal" data-act="goal" type="number"
                 inputmode="numeric" min="1" step="1" value="${state.goal ?? ''}">
        </div>`);
      if (f.includes('goal_period')) rows.push(`
        <div class="field">
          <label class="field__label">Период</label>
          ${seg('goal_period', [{ id: 'day', name: 'День' }, { id: 'week', name: 'Неделя' },
                                { id: 'none', name: 'Без нормы' }], state.goal_period)}
        </div>`);
      return `<div class="blk">${rows.join('')}</div>`;
    }

    if (step === 3) {
      return `
        <div class="blk">
          <h3 class="blk__title">Быстрые значения <span>первое на тап, второе на удержание</span></h3>
          <div class="chips" id="tf-quick">
            ${state.quick.map((v, i) => `<span class="chip chip--val is-on">${v}
                <button class="chip__x" type="button" data-act="unquick" data-value="${i}">✕</button>
              </span>`).join('')}
          </div>
          <div class="field__row">
            <input class="manual__input" id="tf-qv" type="number" inputmode="numeric"
                   min="1" step="1" placeholder="${state.unit || 'значение'}">
            <button class="btn" type="button" data-act="addquick">Добавить</button>
          </div>
          <p class="field__hint">Третье и дальше доступны только с экрана темы.</p>
        </div>`;
    }

    if (step === 4) {
      const thresholds = state.urgency_kind === 'none' ? '' : `
        <div class="field__row">
          <input class="manual__input" data-act="soft_after" type="number" inputmode="numeric"
                 min="0" step="1" placeholder="мягкий, мин" value="${state.soft_after ?? ''}">
          <input class="manual__input" data-act="hard_after" type="number" inputmode="numeric"
                 min="0" step="1" placeholder="жёсткий, мин" value="${state.hard_after ?? ''}">
        </div>
        <p class="field__hint">Мягкий порог наступает раньше жёсткого, иначе красный уровень
          недостижим.</p>`;

      return `
        <div class="blk">
          <h3 class="blk__title">Когда торопить</h3>
          ${seg('urgency_kind', URGENCY, state.urgency_kind)}
          ${thresholds}
        </div>`;
    }

    /* Шаг 5: вид кружка */
    const off = CONTENT_OFF[state.kind] ?? [];
    const contents = CONTENTS.filter((c) => !off.includes(c.id));
    const detailed = state.content === 'emblem_detailed';
    const ids = detailed ? DETAIL_IDS : EMBLEM_IDS;
    const names = detailed ? DETAILS : EMBLEMS;
    const q = (state.query ?? '').trim().toLowerCase();
    const shown = ids.filter((id) => !q || (names[id]?.name ?? id).toLowerCase().includes(q));

    return `
      <div class="blk">
        <h3 class="blk__title">Цвет</h3>
        <div class="signs">
          ${COLORS.map((c) => `<button class="sign${c === state.color ? ' is-on' : ''}"
              type="button" data-act="color" data-value="${c}" aria-label="Цвет">
              <span style="display:block;width:24px;height:24px;border-radius:50%;background:${c}"></span>
            </button>`).join('')}
        </div>
      </div>

      <div class="blk">
        <h3 class="blk__title">Чем заполнен кружок</h3>
        ${seg('content', contents, state.content)}
        <p class="field__hint">${contents.find((c) => c.id === state.content)?.hint ?? ''}</p>
      </div>

      <div class="blk">
        <h3 class="blk__title">Знак</h3>
        ${state.content === 'glyph' ? `
          <input class="manual__input" data-act="letter" type="text" maxlength="2"
                 value="${state.letter}" placeholder="До двух символов">`
        : `
          <input class="manual__input" data-act="query" type="search"
                 value="${state.query ?? ''}" placeholder="Поиск по названию">
          <div class="signs">
            ${shown.map((id) => `<button class="sign${id === state.emblem ? ' is-on' : ''}"
                type="button" data-act="emblem" data-value="${id}"
                aria-label="${names[id]?.name ?? id}">${
                  detailed ? detailSvg(id, { size: 26, color: state.color })
                           : emblemSvg(id, { size: 26, color: state.color })
                }</button>`).join('')}
          </div>
          ${shown.length ? '' : '<p class="field__hint">Ничего не нашлось.</p>'}`}
      </div>`;
  }

  function render() {
    const list = steps();
    const idx = list.findIndex((s) => s.n === step);
    const current = list[idx] ?? list[0];
    step = current.n;

    $('#tf-head').textContent = editing
      ? `Правка: ${current.title}`
      : `Новая тема: ${current.title}`;

    $('#tf-body').innerHTML = stepBody();
    $('#tf-back').textContent = idx === 0 ? 'Отмена' : 'Назад';
    $('#tf-next').textContent = idx === list.length - 1 ? 'Сохранить' : 'Далее';

    drawPreview();
  }

  /* ---------- сохранение ---------- */

  async function save() {
    const payload = {
      name: state.name,
      short: state.short || null,
      description: state.description || null,
      kind: state.kind,
      unit: state.unit || null,
      direction: fields().includes('direction') ? state.direction : null,
      goal_period: fields().includes('goal_period') ? state.goal_period : null,
      urgency_kind: fields().includes('urgency') ? state.urgency_kind : 'none',
      soft_after: state.urgency_kind === 'none' ? null : state.soft_after,
      hard_after: state.urgency_kind === 'none' ? null : state.hard_after,
      quick: fields().includes('quick') ? state.quick : [],
      color: state.color,
      emblem: packEmblem(state),
      fill: state.content,
      active: state.active,
    };

    const theme = editing
      ? await engine.updateTheme(editing, payload)
      : await engine.createTheme(payload);

    // Норма живёт отдельной записью с датой: прошлое не переписывается.
    if (fields().includes('goal') && state.goal) {
      await engine.setGoal(theme.id, Number(state.goal));
    }

    close();
    onSaved?.(theme.id);
  }

  /* ---------- события ---------- */

  $('#tf-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    const { act, value } = b.dataset;

    if (act === 'addquick') {
      const input = $('#tf-qv');
      const v = Number(input.value);
      if (!Number.isInteger(v) || v <= 0) return say('Быстрое значение - целое больше нуля');
      state.quick.push(v);
      input.value = '';
      say('');
    } else if (act === 'unquick') {
      state.quick.splice(Number(value), 1);
    } else if (act === 'active') {
      state.active = value === 'on';
    } else if (act === 'kind') {
      state.kind = value;
      const off = CONTENT_OFF[value] ?? [];
      if (off.includes(state.content)) state.content = 'emblem_solid';
    } else if (act === 'content') {
      state.content = value;
      // Подробные знаки и силуэты - разные наборы, идентификаторы не пересекаются.
      if (value === 'emblem_detailed' && !DETAILS[state.emblem]) state.emblem = 'target';
      if (value !== 'emblem_detailed' && !EMBLEMS[state.emblem]) state.emblem = 'drop';
    } else if (act) {
      state[act] = value;
    }

    render();
  });

  $('#tf-body').addEventListener('input', (e) => {
    const act = e.target.dataset.act;
    if (!act) return;

    state[act] = e.target.type === 'number' ? Number(e.target.value) || null : e.target.value;

    const counter = $(`[data-count="${act}"]`);
    if (counter) counter.textContent = `${e.target.value.length} / ${e.target.dataset.max}`;

    if (act === 'query') { render(); return; }
    drawPreview();
  });

  $('#tf-back').addEventListener('click', () => {
    const list = steps();
    const idx = list.findIndex((s) => s.n === step);
    if (idx <= 0) return close();
    step = list[idx - 1].n;
    say('');
    render();
  });

  $('#tf-next').addEventListener('click', async () => {
    const list = steps();
    const idx = list.findIndex((s) => s.n === step);

    if (idx < list.length - 1) {
      step = list[idx + 1].n;
      say('');
      return render();
    }

    try {
      await save();
    } catch (err) {
      // Отказ движка показывается как есть: он объясняет причину словами.
      say(err.message);
    }
  });

  $('.sheet-panel__close').addEventListener('click', close);
  $('.sheet-back').addEventListener('click', close);

  return {
    el,

    async open(themeId) {
      editing = themeId ?? null;
      state = themeId ? await fromTheme(await engine.get(themeId)) : blank();
      step = 1;
      say('');
      render();
      el.hidden = false;
    },

    close,
  };
}
