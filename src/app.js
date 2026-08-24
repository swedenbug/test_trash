/*
  app.js — рабочее приложение.
  Назначение: собрать главный экран на живых данных и связать жесты с хранилищем.
  Зависимости: ядро, тема воды, элементы интерфейса.

  Питание и спорт присутствуют как заглушки: тем ещё нет, но экран должен
  показывать, как он поведёт себя с тремя темами.
*/

import { createLocalAdapter } from './core/adapter-local.js';
import { createStore } from './core/store.js';
import { createWater, TAP, HOLD } from './modules/water.js';
import { circleSvg } from './ui/circle.js';
import { cardHtml } from './ui/card.js';
import { createUndo } from './ui/undo.js';
import { attachHold } from './ui/gestures.js';
import { createWaterScreen } from './ui/water-screen.js';

const store = createStore(createLocalAdapter());
const water = createWater(store);

const undo = createUndo(document.body);
const screen = createWaterScreen({ water, undo, onChange: render });
document.body.append(screen.el);

/* Заглушки тем, по которым ещё нет ни логики, ни брифа на эмблему. */
const stubs = [
  { id: 'nutrition', title: 'Питание', short: 'Питание', glyph: 'П',
    description: 'Ежедневная норма калорий', unit: 'ккал',
    value: 0, goal: 2100, level: 'done', foot: 'тема ещё не подключена' },
  { id: 'sport', title: 'Спорт', short: 'Спорт', glyph: 'С',
    description: 'Тренировки на этой неделе', unit: 'тренировки',
    value: 0, goal: 4, level: 'done', foot: 'тема ещё не подключена' },
];

const order = ['nutrition', 'water', 'sport'];
const WEIGHT = { hard: 2, soft: 1, done: 0 };

let percentUntil = 0;      // до какого момента показывать процент в кружке
let holdState = null;      // состояние текущего удержания

function stubTheme(s) {
  return {
    ...s, color: 'var(--c-faint)',
    urgency: { level: s.level, fill: 0, value: s.value, goal: s.goal },
    /* Неподключённая тема не занимает экран впустую: ни фона, ни графиков —
       карточка сжимается до шапки и цифр. */
    series: { cumulative: [] }, views: [], background: false,
  };
}

async function collect() {
  const u = await water.getUrgency();
  const themes = {
    water: {
      id: 'water', title: water.title, short: water.short,
      description: water.description, unit: water.unit, color: water.color,
      glyph: null, urgency: u,
      foot: footFor(u),
      series: await water.series(),
      views: ['day-line', 'week-line', 'week-bars'], background: true,
    },
  };
  for (const s of stubs) themes[s.id] = stubTheme(s);
  return themes;
}

function footFor(u) {
  if (u.since === null) return 'записей пока нет';
  if (u.since < 1) return 'последний приём только что';
  if (u.since < 60) return `последний приём ${u.since} мин назад`;
  const h = Math.floor(u.since / 60);
  const m = u.since % 60;
  return `последний приём ${h} ч${m ? ` ${m} мин` : ''} назад`;
}

function header() {
  const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return `
    <header class="topbar">
      <span class="topbar__date">${today}</span>
      <button class="topbar__menu" type="button" aria-label="Меню">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" stroke="var(--c-ink)"
            stroke-width="2" stroke-linecap="round" fill="none"/>
        </svg>
      </button>
    </header>`;
}

function tabbar() {
  const home = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5V21H3z" fill="none" stroke="var(--c-ink)"
        stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const stub = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" fill="none"
        stroke="var(--c-line)" stroke-width="1.8"/></svg>`;
  return `<nav class="tabbar"><ul class="tabbar__row">${
    [home, stub, stub, stub, stub].map((i, n) =>
      `<li class="tab${n === 0 ? ' is-on' : ''}">${i}</li>`).join('')
  }</ul></nav>`;
}

async function render() {
  const themes = await collect();

  const ringOrder = [...order].sort((a, b) => {
    const d = WEIGHT[themes[b].urgency.level] - WEIGHT[themes[a].urgency.level];
    return d !== 0 ? d : order.indexOf(a) - order.indexOf(b);
  });

  const rings = ringOrder.map((key) => {
    const t = themes[key];
    const isWater = key === 'water';
    const showPct = isWater && performance.now() < percentUntil;

    return `<li class="ring" data-theme="${key}">
        ${circleSvg({
          size: 72,
          level: t.urgency.level,
          fill: t.urgency.fill,
          glyph: t.glyph,
          color: t.color,
          percent: showPct ? Math.round(t.urgency.fill * 100) : null,
          hold: isWater ? holdState : null,
        })}
        <span class="ring__label">${t.short}</span>
      </li>`;
  }).join('');

  const feed = order.map((key) => {
    const t = themes[key];
    return cardHtml({
      theme: key,
      title: t.title, description: t.description,
      value: t.urgency.value, goal: t.urgency.goal, unit: t.unit,
      foot: t.foot, series: t.series,
      glyph: t.glyph, color: t.color,
      views: t.views, background: t.background, page: 0,
    });
  }).join('');

  document.getElementById('screen').innerHTML =
    header() +
    `<nav class="rings"><ul class="rings__row">${rings}</ul></nav>` +
    `<div class="feed">${feed}</div>` +
    tabbar();

  bindWaterRing();
}

function bindWaterRing() {
  const el = document.querySelector('.ring[data-theme="water"]');
  if (!el) return;

  attachHold(el, {
    onProgress(state) { holdState = state; paintRingOnly(); },

    async onTap() {
      const ml = await store.setting('water.tap_ml');
      await record(ml, TAP);
    },

    async onFirst() {
      const ml = await store.setting('water.hold_ml');
      await record(ml, HOLD);
    },

    async onSecond() {
      holdState = null;
      await screen.open();
      await render();
    },
  });
}

/* Перерисовка одного кружка на каждом кадре удержания: полная сборка экрана
   шестьдесят раз в секунду не нужна и заметно тормозит. */
async function paintRingOnly() {
  const el = document.querySelector('.ring[data-theme="water"] svg');
  if (!el) return;
  const u = await water.getUrgency();
  el.outerHTML = circleSvg({
    size: 72, level: u.level, fill: u.fill,
    color: water.color, hold: holdState,
    percent: performance.now() < percentUntil ? Math.round(u.fill * 100) : null,
  });
}

async function record(ml, source) {
  try {
    const rec = await water.add(ml, source);
    undo.push({ label: `${rec.amount_ml} мл`, onUndo: () => water.remove(rec.id) });
    percentUntil = performance.now() + 7000;
    await render();
    setTimeout(render, 7100);            // погасить процент, когда истечёт окно
  } catch (e) {
    alert(`Запись не сохранена: ${e.message}`);
  }
}

store.onChange('water_intake', () => { screen.refresh(); });
render();
