/*
  looks.js — пять концепций оформления одного и того же экрана.
  Назначение: выбрать одну. Данные во всех вариантах одинаковые, чтобы
  сравнение было честным: отличается только способ подачи.
  Зависимости: circle.js, emblems.js. В приложение не входит.

  Каждый вариант отвечает на вопрос «чем это ощущается» по-разному:
  документом, приборной панелью, маршрутом, лентой или табло.
*/

import { circleSvg } from './circle.js';
import { emblemSvg } from './emblems.js';

const DATA = [
  { name: 'Водный баланс', short: 'Вода', sum: '500 из 2500 мл', num: 500, goal: 2500,
    unit: 'мл', level: 'hard', fill: 0.2, color: '#58b6ee', emblem: 'drop', quick: '+250', since: '3 ч' },
  { name: 'Отжимания', short: 'Отжимания', sum: '20 из 50 раз', num: 20, goal: 50,
    unit: 'раз', level: 'soft', fill: 0.4, color: '#35bf6b', emblem: 'dumbbell', quick: '+10', since: '5 ч' },
  { name: 'Чтение', short: 'Чтение', sum: '12 из 30 минут', num: 12, goal: 30,
    unit: 'мин', level: 'soft', fill: 0.4, color: '#b06fe8', emblem: 'book', quick: 'Таймер', since: '2 ч' },
  { name: 'Кофе', short: 'Кофе', sum: '2 из 3 чашек', num: 2, goal: 3,
    unit: 'чашки', level: 'done', fill: 0.66, color: '#e0a32e', emblem: 'cup', quick: '+1', since: '1 ч' },
];

const DONE = [
  { name: 'Зарядка', at: '7:40', color: '#35bf6b', emblem: 'check' },
  { name: 'Витамины', at: '9:05', color: '#e86fa8', emblem: 'pill' },
];

const GOAL = { name: 'Норма воды ежедневно', day: 24, days: 90, left: 7, budget: 9, color: '#58b6ee' };
const CREDIT = 14;

/* ------------------------------------------------------------------ */
/* А. Журнал: документ, а не приложение                                */
/* ------------------------------------------------------------------ */

function journal() {
  const rows = DATA.map((t, i) => `
    <li class="jr">
      <span class="jr__n">${String(i + 1).padStart(2, '0')}</span>
      <span class="jr__body">
        <span class="jr__top">
          <b>${t.name}</b>
          <em>${t.since} назад</em>
        </span>
        <span class="jr__val">
          <u style="color:${t.color}">${t.num}</u> из ${t.goal} ${t.unit}
        </span>
        <span class="jr__line"><i style="width:${t.fill * 100}%;background:${t.color}"></i></span>
      </span>
      <button class="jr__act" type="button">${t.quick}</button>
    </li>`).join('');

  return `
    <div class="v v-journal">
      <div class="jhead">
        <div>
          <span class="jhead__l">Личное дело</span>
          <h4>Вторник, 25 августа</h4>
        </div>
        <span class="jhead__c">кредит доверия · ${CREDIT}</span>
      </div>

      <div class="jsec">Открыто <span>${DATA.length}</span></div>
      <ul class="jlist">${rows}</ul>

      <div class="jsec">Закрыто <span>${DONE.length}</span></div>
      <ul class="jlist jlist--done">
        ${DONE.map((d, i) => `
          <li class="jr jr--done">
            <span class="jr__n">${String(DATA.length + i + 1).padStart(2, '0')}</span>
            <span class="jr__body"><span class="jr__top"><b>${d.name}</b><em>${d.at}</em></span></span>
          </li>`).join('')}
      </ul>

      <div class="jgoal">
        <span class="jgoal__t">${GOAL.name}</span>
        <span class="jgoal__d">День ${GOAL.day} из ${GOAL.days} · пропусков ${GOAL.left} из ${GOAL.budget}</span>
        <span class="jr__line"><i style="width:${(GOAL.day / GOAL.days) * 100}%;background:${GOAL.color}"></i></span>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Б. Плитки: приборная панель, всё видно сразу                        */
/* ------------------------------------------------------------------ */

function tiles() {
  const cells = DATA.map((t, i) => `
    <li class="tile${i === 0 ? ' tile--wide' : ''}" style="--c:${t.color}">
      <span class="tile__sign">${emblemSvg(t.emblem, { size: 22, color: t.color })}</span>
      <span class="tile__num">${t.num}<em>/${t.goal}</em></span>
      <span class="tile__name">${t.name}</span>
      <span class="tile__bar"><i style="width:${t.fill * 100}%"></i></span>
      <button class="tile__act" type="button">${t.quick}</button>
    </li>`).join('');

  return `
    <div class="v v-tiles">
      <div class="thead">
        <h4>Сегодня</h4>
        <span class="tcredit">${CREDIT} кредита</span>
      </div>
      <ul class="tgrid">${cells}</ul>
      <div class="tgoal" style="--c:${GOAL.color}">
        <span class="tgoal__t">${GOAL.name}</span>
        <span class="tgoal__big">${GOAL.day}<em>/${GOAL.days}</em></span>
        <span class="tile__bar"><i style="width:${(GOAL.day / GOAL.days) * 100}%"></i></span>
        <span class="tgoal__s">Пропусков в запасе ${GOAL.left} из ${GOAL.budget}</span>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* В. Маршрут: день как путь, темы как станции                         */
/* ------------------------------------------------------------------ */

function track() {
  const all = [...DONE.map((d) => ({ ...d, passed: true })), ...DATA];

  const stops = all.map((t) => `
    <li class="stop${t.passed ? ' is-passed' : ''}">
      <span class="stop__dot">
        ${circleSvg({ size: 44, level: t.passed ? 'done' : t.level,
                      fill: t.passed ? 1 : t.fill, color: t.color, emblem: t.emblem })}
      </span>
      <span class="stop__body">
        <b>${t.name}</b>
        <span>${t.passed ? `сделано в ${t.at}` : t.sum}</span>
      </span>
      ${t.quick ? `<button class="stop__act" type="button">${t.quick}</button>` : ''}
    </li>`).join('');

  return `
    <div class="v v-track">
      <div class="thead">
        <h4>Путь дня</h4>
        <span class="tcredit">${CREDIT} кредита</span>
      </div>
      <ul class="stops">${stops}</ul>
      <p class="tracknote">Пройдено ${DONE.length} из ${all.length}. Осталось ${DATA.length}.</p>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Г. Лента: крупные карточки, как истории                             */
/* ------------------------------------------------------------------ */

function stories() {
  const cards = DATA.map((t) => `
    <li class="scard" style="--c:${t.color}">
      <span class="scard__glow"></span>
      <span class="scard__sign">${circleSvg({ size: 56, level: t.level, fill: t.fill,
                                              color: t.color, emblem: t.emblem })}</span>
      <span class="scard__name">${t.name}</span>
      <span class="scard__num">${t.num}<em> / ${t.goal} ${t.unit}</em></span>
      <button class="scard__act" type="button">${t.quick}</button>
    </li>`).join('');

  return `
    <div class="v v-stories">
      <div class="thead">
        <h4>Сегодня</h4>
        <span class="tcredit">${CREDIT} кредита</span>
      </div>
      <ul class="srow">${cards}</ul>
      <p class="srow__hint">Листается вбок. Остальное - списком ниже.</p>
      <ul class="smini">
        ${DONE.map((d) => `<li><span style="color:${d.color}">${emblemSvg(d.emblem, { size: 16, color: d.color })}</span>${d.name}<em>${d.at}</em></li>`).join('')}
      </ul>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Д. Табло: счёт дня, крупные цифры                                   */
/* ------------------------------------------------------------------ */

function score() {
  const rows = DATA.map((t) => `
    <li class="srow2" style="--c:${t.color}">
      <span class="srow2__name">${t.name}</span>
      <span class="srow2__score">${t.num}<em>:${t.goal}</em></span>
      <span class="srow2__bar"><i style="width:${t.fill * 100}%"></i></span>
      <button class="srow2__act" type="button">${t.quick}</button>
    </li>`).join('');

  return `
    <div class="v v-score">
      <div class="sboard">
        <span class="sboard__l">Счёт дня</span>
        <span class="sboard__big">${DONE.length}<em>:${DATA.length + DONE.length}</em></span>
        <span class="sboard__c">кредит ${CREDIT}</span>
      </div>
      <ul class="slist">${rows}</ul>
      <div class="sgoal">
        <span class="sgoal__l">Цель</span>
        <span class="sgoal__t">${GOAL.name}</span>
        <span class="sgoal__n">${GOAL.day}<em>/${GOAL.days}</em></span>
        <span class="srow2__bar"><i style="width:${(GOAL.day / GOAL.days) * 100}%;background:${GOAL.color}"></i></span>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */

const VARIANTS = [
  { id: 'journal', name: 'А. Журнал',
    idea: 'Документ, а не приложение. Нумерация строк, строгая типографика, тонкие линии. Отталкивается от бумажного дела, которое человек ведёт сам на себя.',
    plus: 'Взросло и спокойно, не надоедает годами',
    minus: 'Меньше всего похоже на что-то приятное',
    make: journal },
  { id: 'tiles', name: 'Б. Плитки',
    idea: 'Приборная панель. Крупные цифры, плитки разного размера, цвет темы как фон. Всё видно за один взгляд, без прокрутки.',
    plus: 'Плотно, обзорно, легко читается на ходу',
    minus: 'Плохо растёт: десять тем превращаются в мозаику',
    make: tiles },
  { id: 'track', name: 'В. Маршрут',
    idea: 'День как путь, темы как станции на нём. Пройденное залито, линия впереди пустая. Ощущение движения вместо перечня дел.',
    plus: 'Виден путь и то, что он не бесконечен',
    minus: 'Порядок выглядит обязательным, хотя он не такой',
    make: track },
  { id: 'stories', name: 'Г. Лента',
    idea: 'Крупные карточки, листаются вбок, свечение в цвет темы. Прямая отсылка к тому, к чему привык палец.',
    plus: 'Живо и знакомо, самое дружелюбное к молодым',
    minus: 'За раз видно одну-две темы, обзор теряется',
    make: stories },
  { id: 'score', name: 'Д. Табло',
    idea: 'Спортивное табло. Счёт дня крупно, моноширинные цифры, жёсткая графика. День как матч с самим собой.',
    plus: 'Заводит, даёт азарт, понятен счёт',
    minus: 'Счёт легко читается как оценка личности',
    make: score },
];

export function createLooks(mount) {
  mount.innerHTML = VARIANTS.map((v) => `
    <section class="look">
      <h2 class="look__name">${v.name}</h2>
      <p class="look__idea">${v.idea}</p>
      <p class="look__pm"><b>За:</b> ${v.plus}<br><b>Против:</b> ${v.minus}</p>
      <div class="look__frame">${v.make()}</div>
    </section>`).join('');
}
