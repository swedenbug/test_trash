/*
  theme-form.js - макет экрана создания темы.
  Назначение: показать, как пользователь заводит тему, и как форма
  меняется в зависимости от выбранного вида.
  Зависимости: circle.js, emblems.js. Данных не пишет - это макет.

  Форма показывает только то, что относится к делу: у флажка нет единицы
  и быстрых значений, у группы нет ничего, кроме имени и знака. Поля,
  которые ни на что не влияют, хуже отсутствующих: они выглядят рабочими.
*/

import { circleSvg } from './circle.js';
import { EMBLEMS, EMBLEM_IDS, emblemSvg, DETAILS, DETAIL_IDS, detailSvg } from './emblems.js';

/*
  Названия видов подобраны так, чтобы их не приходилось объяснять.
  «Флажок» и «Шкала» были заменены: первое читалось как элемент формы,
  второе - как единица измерения.
*/
const KINDS = [
  { id: 'check', name: 'Да или нет',
    hint: 'Отметка о выполнении. Кружок либо заполнен целиком, либо пуст. В списке - галочка' },
  { id: 'count', name: 'Количество',
    hint: 'Число в своих единицах: миллилитры, калории, шаги, повторы' },
  { id: 'time',  name: 'Время',
    hint: 'Накопление минут. Есть секундомер и таймер' },
  { id: 'scale', name: 'Оценка от 1 до 10',
    hint: 'Один балл в день: сон, настроение, самочувствие' },
  { id: 'note',  name: 'Запись',
    hint: 'Одна строка в день. Успех - что запись вообще есть' },
  { id: 'group', name: 'Группа',
    hint: 'Не считает ничего сама. Собирает прогресс из вложенных тем' },
];

/* Чем заполнен кружок. Знак с заливкой полезен там, где есть дневная норма;
   где нормы нет, заливка ничего не сообщает. */
const CONTENTS = [
  { id: 'fill',    name: 'Знак с заливкой',  hint: 'Заполняется снизу вверх по мере выполнения' },
  { id: 'solid',   name: 'Знак целиком',     hint: 'Сплошной силуэт, заливки нет' },
  { id: 'detail',  name: 'Подробный знак',   hint: 'Линиями: бег, велосипед, мишень. Не заливается' },
  { id: 'letter',  name: 'Буква или цифра',  hint: 'До двух символов' },
  { id: 'value',   name: 'Число и норма',    hint: 'Например, 10 из 90' },
  { id: 'percent', name: 'Процент',          hint: 'Доля выполненного' },
];

/* Только холодная половина круга плюс приглушённый песочный: зелёное
   и красное заняты кольцом срочности, янтарное кредитом. */
const COLORS = [
  '#58b6ee', '#38d0e8', '#17b8c4', '#5b7cf5',
  '#a78bfa', '#d46ce8', '#f472b6', '#c9b070',
];

const URGENCY = [
  { id: 'since_last', name: 'По времени с последнего раза' },
  { id: 'day_left',   name: 'По остатку дня' },
  { id: 'none',       name: 'Не подгонять' },
];

/* Что показывать при каждом виде. Список полей - тоже данные. */
const FIELDS = {
  check: ['goal_period', 'urgency', 'look'],
  count: ['unit', 'direction', 'goal', 'quick', 'urgency', 'look'],
  time:  ['direction', 'goal', 'quick', 'urgency', 'look'],
  scale: ['urgency', 'look'],
  note:  ['urgency', 'look'],
  group: ['look'],
};

/* Наполнения, которые для этого вида темы бессмысленны. Заливка без нормы
   ничего не показывает, число без нормы - половина подписи. */
const CONTENT_OFF = {
  check: ['value', 'percent'],
  scale: ['fill', 'value', 'percent'],
  note:  ['fill', 'value', 'percent'],
  group: ['value'],
};

export function createThemeForm(mount) {
  const state = {
    name: 'Отжимания',
    short: 'Отжимания',
    description: 'Ежедневная норма',
    kind: 'count',
    parent: 'sport',
    unit: 'раз',
    direction: 'at_least',
    goal: 50,
    goal_period: 'day',
    quick: [10, 20],
    urgency: 'day_left',
    soft_after: 240,
    hard_after: 60,
    color: COLORS[1],
    emblem: 'dumbbell',
    content: 'fill',
    letter: 'От',
    allSigns: false,
    groups: [
      { id: 'sport',  name: 'Спорт' },
      { id: 'health', name: 'Здоровье' },
    ],
  };

  mount.innerHTML = `
    <div class="tf">
      <div class="tf__preview" id="tf-preview"></div>
      <div class="tf__body" id="tf-body"></div>
    </div>`;

  const preview = mount.querySelector('#tf-preview');
  const body = mount.querySelector('#tf-body');

  /* ---------- предпросмотр ---------- */

  function drawPreview() {
    const goalValue = state.kind === 'check' ? 1 : state.goal || 1;
    const done = state.kind === 'check' ? 1 : Math.round(goalValue * 0.45);
    const level = state.urgency === 'none' ? 'done'
                : state.direction === 'at_most' ? 'soft' : 'soft';

    preview.innerHTML = `
      <div class="tf__ring">
        ${circleSvg({ size: 76, level, fill: done / goalValue,
                      color: state.color, emblem: state.emblem,
                      content: state.content, text: state.letter,
                      value: done, goal: goalValue })}
        <span class="tf__ringlabel">${state.short || 'Тема'}</span>
      </div>
      <div class="tf__sum">
        <b>${state.name || 'Без названия'}</b>
        <span>${summary()}</span>
      </div>`;
  }

  function summary() {
    if (state.kind === 'group') return 'Группа: прогресс складывается из детей';
    if (state.kind === 'check') return 'Флажок: сделано или нет';
    if (state.kind === 'scale') return 'Шкала от 1 до 10';
    if (state.kind === 'note') return 'Одна строка в день';
    const dir = state.direction === 'at_most' ? 'не более' : 'не менее';
    const per = state.goal_period === 'week' ? 'в неделю' : 'в день';
    return `${dir} ${state.goal} ${state.unit} ${per}`;
  }

  /* ---------- поля ---------- */

  /* Выпадающий список вместо ряда кнопок. Шесть кнопок в строку на телефоне
     переносятся в три ряда и занимают экран; список занимает одну строку
     и открывается системным выбором, к которому палец уже привык. */
  const select = (label, act, items, current, off = []) => `
    <div class="field">
      <label class="field__label" for="tf-${act}">${label}</label>
      <div class="sel">
        <select id="tf-${act}" data-act="${act}">
          ${items.map((i) => `<option value="${i.id}"${i.id === current ? ' selected' : ''}
            ${off.includes(i.id) ? ' disabled' : ''}>${i.name}</option>`).join('')}
        </select>
      </div>
      ${items.find((i) => i.id === current)?.hint
        ? `<p class="field__hint">${items.find((i) => i.id === current).hint}</p>` : ''}
    </div>`;

  const seg = (name, items, current, onPick) => `
    <div class="field">
      <span class="field__label">${name}</span>
      <div class="seg">${items.map((i) => `
        <button type="button" class="seg__b${i.id === current ? ' is-on' : ''}"
          data-act="${onPick}" data-value="${i.id}">${i.name}</button>`).join('')}
      </div>
      ${items.find((i) => i.id === current)?.hint
        ? `<p class="field__hint">${items.find((i) => i.id === current).hint}</p>` : ''}
    </div>`;

  /* Поле с подписью и счётчиком символов. Счётчик нужен там, где длина
     ограничена: иначе обрезание становится сюрпризом. */
  const text = (label, act, value, max, hint = '', placeholder = '') => `
    <div class="field">
      <div class="field__top">
        <label class="field__label" for="tf-${act}">${label}</label>
        <span class="field__count" data-count="${act}">${value.length} / ${max}</span>
      </div>
      <input class="manual__input" id="tf-${act}" data-act="${act}" data-max="${max}"
             maxlength="${max}" value="${value}" placeholder="${placeholder}">
      ${hint ? `<p class="field__hint">${hint}</p>` : ''}
    </div>`;

  const block = (title, note, inner) => `
    <section class="blk">
      <h3 class="blk__title">${title}${note ? `<span>${note}</span>` : ''}</h3>
      ${inner}
    </section>`;

  function render() {
    const show = FIELDS[state.kind];
    const isDetail = state.content === 'detail';
    const ids = isDetail ? DETAIL_IDS : EMBLEM_IDS;
    const visible = state.allSigns ? ids : ids.slice(0, 8);

    /* --- 1. Название --- */
    const one = [
      text('Название', 'name', state.name, 64),
      text('Подпись под кружком', 'short', state.short, 12,
           'Длинное название под кружком не помещается, поэтому подпись отдельная.'),
    ];
    if (show.includes('unit')) one.push(text('Единица', 'unit', state.unit, 12, '', 'мл, ккал, раз'));

    /* --- 2. Что считаем --- */
    const two = [select('Вид темы', 'kind', KINDS, state.kind)];

    two.push(`
      <div class="field">
        <label class="field__label" for="tf-parent">Группа</label>
        <div class="sel">
          <select id="tf-parent" data-act="parent">
            <option value=""${!state.parent ? ' selected' : ''}>Без группы</option>
            ${state.groups.map((g) => `<option value="${g.id}"${state.parent === g.id ? ' selected' : ''}>${g.name}</option>`).join('')}
            <option value="__new">Новая группа...</option>
          </select>
        </div>
        ${state.parent === '__new' ? `
          <div class="field__row" style="margin-top:.5rem">
            <input class="manual__input" id="tf-newgroup" placeholder="Название группы">
            <button class="btn" type="button" data-act="creategroup" data-value="1">Создать</button>
          </div>
          <p class="field__hint">Группа - такая же тема, только вида «Группа».
            Она ничего не считает сама и собирает прогресс из вложенных.</p>` : ''}
      </div>`);

    if (show.includes('direction')) two.push(seg('Направление', [
      { id: 'at_least', name: 'Не менее', hint: 'Успех, когда норма набрана' },
      { id: 'at_most',  name: 'Не более', hint: 'Успех, только когда день закончился и норма не превышена' },
    ], state.direction, 'direction'));

    if (show.includes('goal')) two.push(`
      <div class="field">
        <label class="field__label" for="tf-goal">Норма</label>
        <div class="field__row">
          <input class="manual__input" id="tf-goal" type="number" data-act="goal" value="${state.goal}">
          <button type="button" class="seg__b${state.goal_period === 'day' ? ' is-on' : ''}"
            data-act="goal_period" data-value="day">В день</button>
          <button type="button" class="seg__b${state.goal_period === 'week' ? ' is-on' : ''}"
            data-act="goal_period" data-value="week">В неделю</button>
        </div>
        <p class="field__hint">Норма хранится историей: прошлые дни остаются
          посчитанными по той норме, что была тогда.</p>
      </div>`);

    if (show.includes('quick')) two.push(`
      <div class="field">
        <span class="field__label">Быстрые значения</span>
        <div class="chips">
          ${state.quick.map((q, i) => `
            <span class="chip chip--val is-on">${q}&nbsp;${state.unit}
              <button type="button" class="chip__x" data-act="delquick" data-value="${i}"
                aria-label="Убрать">✕</button></span>`).join('')}
          <button type="button" class="chip chip--add" data-act="addquick" data-value="1">+</button>
        </div>
        <p class="field__hint">Первое - по тапу, второе - по удержанию секунды.
          Удержание трёх секунд всегда открывает экран темы.</p>
      </div>`);

    /* --- 3. Как выглядит --- */
    const three = [select('Что в кружке', 'content', CONTENTS, state.content,
                          CONTENT_OFF[state.kind] ?? [])];

    if (state.content === 'letter') three.push(text('Буква или цифра', 'letter', state.letter, 2));

    if (state.content !== 'letter' && state.content !== 'value' && state.content !== 'percent') {
      three.push(`
        <div class="field">
          <span class="field__label">Знак</span>
          <div class="signs">
            ${visible.map((id) => `
              <button type="button" class="sign${id === state.emblem ? ' is-on' : ''}"
                data-act="emblem" data-value="${id}"
                title="${(isDetail ? DETAILS : EMBLEMS)[id].name}">
                ${isDetail
                  ? detailSvg(id, { size: 26, color: id === state.emblem ? state.color : 'var(--c-muted)' })
                  : emblemSvg(id, { size: 26, color: id === state.emblem ? state.color : 'var(--c-muted)' })}
              </button>`).join('')}
            ${ids.length > 8 ? `
              <button type="button" class="sign sign--more" data-act="allsigns"
                data-value="${state.allSigns ? '' : '1'}">
                ${state.allSigns ? 'Свернуть' : `+${ids.length - 8}`}
              </button>` : ''}
          </div>
          ${isDetail ? '' : `<p class="field__hint">Силуэты. Компактные намеренно:
            только такая форма показывает уровень заливки.</p>`}
        </div>`);
    }

    three.push(`
      <div class="field">
        <span class="field__label">Цвет</span>
        <div class="swatches">${COLORS.map((c) => `
          <button type="button" class="swatch${c === state.color ? ' is-on' : ''}"
            style="--c:${c}" data-act="color" data-value="${c}" aria-label="Цвет"></button>`).join('')}
        </div>
      </div>`);

    /* --- 4. Когда подгонять --- */
    const four = [];
    if (show.includes('urgency')) {
      four.push(select('Когда подгонять', 'urgency', URGENCY, state.urgency));
      if (state.urgency !== 'none') four.push(`
        <div class="field">
          <span class="field__label">Пороги, минуты</span>
          <div class="field__row">
            <input class="manual__input" type="number" data-act="soft_after" value="${state.soft_after}">
            <input class="manual__input" type="number" data-act="hard_after" value="${state.hard_after}">
          </div>
          <p class="field__hint">${state.urgency === 'since_last'
            ? 'Через сколько минут без действия кольцо зеленеет и краснеет.'
            : 'Сколько минут до конца дня остаётся, когда кольцо зеленеет и краснеет.'}</p>
        </div>`);
    }

    body.innerHTML = [
      block('Как называется', '', one.join('')),
      block('Что считаем', KINDS.find((k) => k.id === state.kind).name, two.join('')),
      block('Как выглядит', '', three.join('')),
      four.length ? block('Когда подгонять', '', four.join('')) : '',
      `<div class="m-actions m-actions--wide">
        <button class="btn btn--main" type="button">Создать тему</button>
        <button class="btn" type="button">Отмена</button>
      </div>`,
    ].join('');

    drawPreview();
  }

  /* ---------- ввод ---------- */

  body.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act;

    if (act === 'addquick') { state.quick = [...state.quick, 0]; return render(); }
    if (act === 'delquick') {
      state.quick = state.quick.filter((_, i) => i !== Number(b.dataset.value));
      return render();
    }
    if (act === 'allsigns') { state.allSigns = Boolean(b.dataset.value); return render(); }
    if (act === 'creategroup') {
      const field = body.querySelector('#tf-newgroup');
      const name = field?.value.trim();
      if (!name) return;
      const id = `g${state.groups.length + 1}`;
      state.groups = [...state.groups, { id, name }];
      state.parent = id;
      return render();
    }

    state[act] = b.dataset.value;
    render();
  });

  body.addEventListener('change', (e) => {
    const act = e.target.dataset.act;
    if (!act || e.target.tagName !== 'SELECT') return;
    const value = e.target.value;

    if (act === 'parent') { state.parent = value || null; return render(); }

    state[act] = value;

    // Смена вида может обесценить выбранное наполнение - переводим на ближайшее
    // осмысленное, а не оставляем поле, которое ничего не покажет.
    const off = CONTENT_OFF[state.kind] ?? [];
    if (off.includes(state.content)) state.content = 'solid';

    // Подробные знаки и силуэты - разные наборы, идентификаторы не пересекаются.
    if (act === 'content') {
      if (value === 'detail' && !DETAILS[state.emblem]) state.emblem = 'target';
      if ((value === 'fill' || value === 'solid') && !EMBLEMS[state.emblem]) state.emblem = 'drop';
    }

    render();
  });

  body.addEventListener('input', (e) => {
    const act = e.target.dataset.act;
    if (!act || e.target.tagName === 'SELECT') return;
    state[act] = e.target.type === 'number' ? Number(e.target.value) : e.target.value;

    const counter = body.querySelector(`[data-count="${act}"]`);
    if (counter) counter.textContent = `${e.target.value.length} / ${e.target.dataset.max}`;

    drawPreview();
  });

  render();
  return { state };
}
