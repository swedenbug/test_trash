/*
  app.js - рабочее приложение.
  Назначение: собрать главный экран и связать его с хранилищем.
  Зависимости: ядро, элементы интерфейса.

  Заход 2 снёс воду и не завёл движок тем: ряд кружков пуст, лента пуста.
  Так и задумано. Оболочка обязана работать без единой темы - это то самое
  правило, по которому любой модуль можно вырезать, а приложение продолжает
  запускаться. Сейчас оно проверяется предельным случаем: тем нет вовсе.

  Экран наполняется в заходе 4, когда появится движок.
*/

import { createLocalAdapter } from './core/adapter-local.js';
import { createStore } from './core/store.js';
import { createSync } from './core/sync.js';
import { createUndo } from './ui/undo.js';
import { createMenu } from './ui/menu.js';
import { createRecent } from './ui/recent.js';

const store = createStore(createLocalAdapter());
const sync = createSync(store);

const undo = createUndo(document.body);

/* Тем нет: лента недавних записей получает пустой список и показывает пустоту. */
const recent = createRecent({ themes: [], undo, onChange: render });
const menu = createMenu({ store, sync, onChange: render, onOpenRecent: () => recent.open() });
document.body.append(menu.el, recent.el);

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
  document.getElementById('screen').innerHTML =
    header() +
    '<nav class="rings"><ul class="rings__row"></ul></nav>' +
    '<div class="feed"></div>' +
    tabbar();

  document.querySelector('.topbar__menu').addEventListener('click', () => menu.open());
}

/* Одна подписка на всё. Правка может прийти откуда угодно, и перерисоваться
   должны все открытые виды сразу. */
const refreshAll = () => { render(); recent.refresh(); };
store.onChange('theme', refreshAll);
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
  Обмен идёт сбоку и молча. Он не показывает ничего поверх экрана: неудача -
  обычное дело, в метро связи нет. Состояние обмена видно в меню, там же
  кнопка «Синхронизировать» и список записей, которых не принял сервер.
*/
function startSync() {
  const quiet = () => sync.run().then(refreshAll).catch(() => {});

  quiet();
  window.addEventListener('online', quiet);
  setInterval(() => { if (!document.hidden) quiet(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) quiet(); });
}
