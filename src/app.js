/*
  app.js - рабочее приложение.
  Назначение: собрать главный экран на живых данных и связать жесты с движком.
  Зависимости: ядро, движок тем, элементы интерфейса.

  Оболочка не знает ни одной темы. Она спрашивает движок, что показывать,
  и рисует ответ: сколько тем, какие у них знаки, цвета и пороги - её не касается.
  Проверка правила: чтобы завести тему, этот файл править не нужно.

  Экран темы, карточки и графики собираются здесь же по данным движка.
*/

import { createLocalAdapter } from './core/adapter-local.js';
import { createStore } from './core/store.js';
import { createSync } from './core/sync.js';
import { createEngine, TAP, HOLD } from './modules/engine.js';
import { circleSvg } from './ui/circle.js';
import { cardHtml, chartBlock } from './ui/card.js';
import { createUndo } from './ui/undo.js';
import { attachHold, attachSwipe } from './ui/gestures.js';
import { createMenu } from './ui/menu.js';
import { createRecent } from './ui/recent.js';
import { createThemeScreen } from './ui/theme-screen.js';

const store = createStore(createLocalAdapter());
const engine = createEngine(store);
const sync = createSync(store);

const undo = createUndo(document.body);

/* Лента недавних записей спрашивает темы по одной. Список наполняется при
   отрисовке: на старте тем ещё нет, а панель создаётся один раз. */
const recentThemes = [];
const recent = createRecent({ themes: recentThemes, undo, onChange: render });
const screen = createThemeScreen({ engine, undo, onChange: render });
const menu = createMenu({ store, sync, onChange: render, onOpenRecent: () => recent.open() });
document.body.append(screen.el, menu.el, recent.el);

/* Порядок кружков: сначала срочные. Внутри уровня - по sort темы. */
const WEIGHT = { hard: 2, soft: 1, done: 0 };

/* Чем заполнен кружок. Слева - как это названо в схеме, справа - в circle.js. */
const CONTENT = {
  emblem_fill:     'fill',
  emblem_solid:    'solid',
  emblem_detailed: 'detail',
  glyph:           'letter',
  value:           'value',
  percent:         'percent',
};

let percentUntil = 0;      // до какого момента показывать процент в кружке
let holdId = null;         // тема, которую сейчас удерживают
let holdState = null;      // состояние текущего удержания
let painted = [];          // последняя отрисовка: тема и её срочность
const chartPage = {};      // открытая страница графика по темам
const chartData = {};      // ряды и виды по темам - для перерисовки одного графика

/*
  Отписки от жестов. Держать их обязательно.

  Перерисовка заменяет разметку целиком, и если она случится, пока палец
  на кружке, обработчик остаётся висеть на выброшенном элементе. Отпускание
  придёт уже новому, а старый об этом не узнает: его кадровый цикл продолжит
  идти и будет рисовать кольцо удержания, которое никто не держит. Через три
  секунды он вдобавок сообщит о переходе - жест, которого не было.

  Перерисовку приносит обмен, он идёт сам по себе, - отсюда «иногда».
*/
let unbind = [];

/* Знак темы записан строкой с указанием набора: silhouette:drop, char:Ф. */
function emblemOf(theme) {
  const [set, name] = String(theme.emblem ?? '').split(':');
  if (set === 'char') return { emblem: 'drop', glyph: name || null };
  return { emblem: name || 'drop', glyph: null };
}

function ringSvg(theme, urgency, withHold) {
  const { emblem, glyph } = emblemOf(theme);
  return circleSvg({
    size: 72,
    level: urgency.level,
    fill: urgency.fill,
    emblem,
    glyph,
    content: CONTENT[theme.fill] ?? 'fill',
    color: theme.color ?? 'var(--c-muted)',
    value: urgency.value,
    // Потолок, а не норма: у шкалы нормы нет, а «5 из 0» - неправда.
    goal: urgency.ceiling ?? 0,
    percent: performance.now() < percentUntil ? Math.round(urgency.fill * 100) : null,
    hold: withHold ? holdState : null,
  });
}

/* Слова о дне под цифрами карточки. Тот же набор, что на экране темы. */
function footFor(theme, urgency) {
  if (urgency.state === 'broken') return 'норма превышена';
  if (urgency.state === 'done') return 'норма выполнена';
  if (theme.direction === 'at_most' && urgency.goal !== null) return 'пока в порядке';
  if (urgency.since === null) return 'записей пока нет';
  if (theme.urgency_kind !== 'time_since') return '';

  const m = urgency.since;
  if (m < 1) return 'последняя запись только что';
  if (m < 60) return `последняя запись ${m} мин назад`;
  const h = Math.floor(m / 60);
  return `последняя запись ${h} ч${m % 60 ? ` ${m % 60} мин` : ''} назад`;
}

/*
  Какие виды графика показывать.

  Накопление за день имеет смысл только у величины: сумма оценок за день -
  это не оценка, а сумма нулей у заметки - не график. Недельные виды вдобавок
  целиком про долю, то есть требуют настоящей нормы.

  Отдельно проверяется, что рисовать вообще есть что: `dayCumulative` берёт
  верх графика как максимум из нормы и значений, и если и то и другое ноль,
  все координаты выходят NaN - разметка получается битой, а в консоли
  три десятка ошибок.
*/
const CUMULATIVE = ['count', 'time'];

function viewsFor(theme, urgency, series) {
  if (!CUMULATIVE.includes(theme.kind)) return [];
  if (urgency.goal !== null) return ['day-line', 'week-line', 'week-bars'];
  return series.cumulative.some((p) => p.ml > 0) ? ['day-line'] : [];
}

async function cardFor(theme, urgency) {
  const { emblem, glyph } = emblemOf(theme);
  const series = await engine.series(theme.id);
  const views = viewsFor(theme, urgency, series);

  chartData[theme.id] = { views, series, goal: urgency.goal ?? 0 };

  return cardHtml({
    theme: theme.id,
    title: theme.name,
    description: theme.description ?? '',
    value: urgency.value,
    goal: urgency.ceiling,
    unit: theme.unit ?? '',
    foot: footFor(theme, urgency),
    series,
    views,
    page: chartPage[theme.id] ?? 0,
    // Фото тем не будет до захода 9; до тех пор карточка живёт цветом темы.
    background: false,
    emblem,
    glyph,
    color: theme.color ?? 'var(--c-muted)',
  });
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
  const themes = await engine.list();

  const withUrgency = [];
  for (const t of themes) {
    withUrgency.push({ theme: t, urgency: await engine.getUrgency(t.id) });
  }

  /* Уровень нигде не хранится: он посчитан только что и определяет порядок
     прямо сейчас. Поэтому сдвиг порога переставляет кружки без записи в базу. */
  withUrgency.sort((a, b) => {
    const d = WEIGHT[b.urgency.level] - WEIGHT[a.urgency.level];
    return d !== 0 ? d : a.theme.sort - b.theme.sort;
  });
  painted = withUrgency;

  /* Лента недавних записей спрашивает каждую тему отдельно. */
  recentThemes.length = 0;
  for (const { theme } of withUrgency) {
    recentThemes.push({
      id: theme.id,
      short: theme.short ?? theme.name,
      color: theme.color ?? 'var(--c-muted)',
      getRecent: async (from) => (await engine.getRecent(from)).filter((r) => r.moduleId === theme.id),
      removeRecord: (id) => engine.removeRecord(id),
      restoreRecord: (id) => engine.restoreRecord(id),
    });
  }

  const rings = withUrgency.map(({ theme, urgency }) => `
      <li class="ring" data-theme="${theme.id}">
        ${ringSvg(theme, urgency, holdId === theme.id)}
        <span class="ring__label">${theme.short ?? theme.name}</span>
      </li>`).join('');

  /*
    Карточки идут по sort темы, а не по срочности. Кружки переставляются,
    карточки нет: список, перескакивающий под пальцем во время чтения,
    читать нельзя. Порядок здесь пользовательский, и он должен быть постоянным.
  */
  const feed = [];
  for (const { theme, urgency } of [...withUrgency].sort((a, b) => a.theme.sort - b.theme.sort)) {
    feed.push(await cardFor(theme, urgency));
  }

  /* Снимаем прежние жесты до замены разметки: отписка гасит кадровый цикл
     и сообщает об окончании удержания. Иначе останется висеть чужой. */
  for (const off of unbind) off();
  unbind = [];

  document.getElementById('screen').innerHTML =
    header() +
    `<nav class="rings"><ul class="rings__row">${rings}</ul></nav>` +
    `<div class="feed">${feed.join('')}</div>` +
    tabbar();

  for (const { theme } of withUrgency) { bindRing(theme); bindChart(theme.id); }
  document.querySelector('.topbar__menu').addEventListener('click', () => menu.open());
}

/* Листание графика. Перерисовывается только сам график: пересборка всего
   экрана на каждый свайп сбрасывала бы прокрутку ленты. */
function bindChart(themeId) {
  const data = chartData[themeId];
  const box = document.querySelector(`.card[data-theme="${themeId}"] .card__chart`);
  if (!data || !box || data.views.length < 2) return;

  const go = (page) => {
    chartPage[themeId] = (page + data.views.length) % data.views.length;
    paintChart(themeId);
  };

  attachSwipe(box, {
    onLeft:  () => go((chartPage[themeId] ?? 0) + 1),
    onRight: () => go((chartPage[themeId] ?? 0) - 1),
  });

  for (const dot of box.querySelectorAll('.card__dot')) {
    dot.addEventListener('click', () => go(Number(dot.dataset.page)));
  }
}

function paintChart(themeId) {
  const data = chartData[themeId];
  const box = document.querySelector(`.card[data-theme="${themeId}"] .card__chart`);
  if (!data || !box) return;

  box.innerHTML = chartBlock({ ...data, page: chartPage[themeId] ?? 0 });
  for (const dot of box.querySelectorAll('.card__dot')) {
    dot.addEventListener('click', () => {
      chartPage[themeId] = Number(dot.dataset.page);
      paintChart(themeId);
    });
  }
}

function bindRing(theme) {
  const el = document.querySelector(`.ring[data-theme="${theme.id}"]`);
  if (!el) return;

  const quick = Array.isArray(theme.quick) ? theme.quick : [];

  unbind.push(attachHold(el, {
    // Состояние гаснет на всех путях выхода: отпускание, уход пальца,
    // отмена касания, переход по трём секундам и отписка при перерисовке -
    // жесты сообщают об окончании через onProgress(null).
    onProgress(state) {
      holdId = state ? theme.id : null;
      holdState = state;
      paintRingOnly(theme.id);
    },

    async onTap() {
      // У оценки и заметки величины нет: тап открывает экран, там и спросят.
      if (theme.kind === 'scale' || theme.kind === 'note') {
        holdId = null;
        holdState = null;
        await screen.open(theme.id);
        return;
      }
      await record(theme, quick[0] ?? 1, TAP);
    },

    async onFirst() {
      // У флажка, оценки и заметки удержание величины не имеет.
      if (theme.kind === 'flag' || theme.kind === 'scale' || theme.kind === 'note') return;
      await record(theme, quick[1] ?? quick[0] ?? 1, HOLD);
    },

    /* Удержание трёх секунд открывает экран темы. Литр при этом не пишется:
       переход и запись исключают друг друга. */
    async onSecond() {
      holdId = null;
      holdState = null;
      await screen.open(theme.id);
      await render();
    },
  }));
}

/* Перерисовка одного кружка на каждом кадре удержания: полная сборка экрана
   шестьдесят раз в секунду не нужна и заметно тормозит. */
function paintRingOnly(themeId) {
  const el = document.querySelector(`.ring[data-theme="${themeId}"] svg`);
  const found = painted.find((p) => p.theme.id === themeId);
  if (!el || !found) return;
  el.outerHTML = ringSvg(found.theme, found.urgency, true);
}

async function record(theme, value, source) {
  try {
    const { record: rec, removed } = await engine.add(theme.id, value, source);
    const label = await engine.labelFor(theme.id, rec);

    undo.push({
      label: removed ? `снято: ${label}` : label,
      onUndo: () => (removed ? engine.restore(rec.id) : engine.remove(rec.id)),
    });

    percentUntil = performance.now() + 7000;
    holdId = null;
    holdState = null;
    await render();
    setTimeout(render, 7100);            // погасить процент, когда истечёт окно
  } catch (e) {
    alert(`Запись не сохранена: ${e.message}`);
  }
}

/* Одна подписка на всё. Отмена может прийти откуда угодно - из ленты,
   с главного экрана, - и перерисоваться должны все открытые виды сразу. */
const refreshAll = () => { render(); screen.refresh(); recent.refresh(); };
store.onChange('theme', refreshAll);
store.onChange('theme_goal', refreshAll);
store.onChange('entry', refreshAll);

/* Порядок важен: сначала данные доводятся до текущей версии схемы,
   и только потом что-либо читается и рисуется. */
(async function start() {
  try {
    await store.init();
  } catch (e) {
    document.getElementById('screen').innerHTML =
      `<p class="fatal">Данные не удалось открыть: ${e.message}</p>`;
    return;
  }

  /* Просим браузер не вычищать хранилище. Ответ ни на что не влияет:
     единственная надёжная защита - копия файлом. */
  store.requestPersistence().catch(() => {});

  await render();
  startSync();
})();

/*
  Обмен идёт сбоку и молча. Он не мешает записывать и не показывает ничего
  поверх экрана: неудача - обычное дело, в метро связи нет. Состояние обмена
  видно в меню, там же список записей, которых не принял сервер.
*/
function startSync() {
  const quiet = () => sync.run().then(refreshAll).catch(() => {});

  quiet();
  window.addEventListener('online', quiet);
  setInterval(() => { if (!document.hidden) quiet(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) quiet(); });
}
