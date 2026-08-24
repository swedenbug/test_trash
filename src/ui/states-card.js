/*
  states-card.js — витрина карточки модуля.
  Назначение: показать страницы графика и сочетания переключателей.
  Зависимости: card.js. В приложение не входит.
*/

import { cardHtml } from './card.js';

const series = {
  cumulative: [
    { hour: 7, ml: 250 }, { hour: 8, ml: 500 }, { hour: 10, ml: 750 },
    { hour: 12, ml: 1000 }, { hour: 14, ml: 1250 },
  ],
  weekCumulative: [
    { day: 'Пн', ml: 2000 }, { day: 'Вт', ml: 4600 }, { day: 'Ср', ml: 6200 },
    { day: 'Чт', ml: 9000 }, { day: 'Пт', ml: 11400 }, { day: 'Сб', ml: 12400 },
    { day: 'Вс', ml: 13650 },
  ],
  week: [
    { day: 'Пн', pct: 80 }, { day: 'Вт', pct: 104 }, { day: 'Ср', pct: 65 },
    { day: 'Чт', pct: 112 }, { day: 'Пт', pct: 95 }, { day: 'Сб', pct: 40 },
    { day: 'Вс', pct: 50, today: true },
  ],
};

const ALL = ['day-line', 'week-line', 'week-bars'];

const cases = [
  {
    name: 'Всё включено. Страница 1',
    hint: 'Накопительная линия по часам. Пунктир — дневная норма.',
    opts: { views: ALL, page: 0, background: true },
  },
  {
    name: 'Всё включено. Страница 2',
    hint: 'Та же линия, накопление по дням. Пунктир — недельный объём.',
    opts: { views: ALL, page: 1, background: true },
  },
  {
    name: 'Всё включено. Страница 3',
    hint: 'Столбик — доля нормы за день. Сегодня выделен.',
    opts: { views: ALL, page: 2, background: true },
  },
  {
    name: 'Только бар недели',
    hint: 'Два графика отключены. Осталась одна страница, точки-указатели не показываются: листать нечего.',
    opts: { views: ['week-bars'], page: 0, background: true },
  },
  {
    name: 'Картинка есть, графиков нет',
    hint: 'Высота сохраняется — иначе изображение не разглядеть.',
    opts: { views: [], page: 0, background: true },
  },
  {
    name: 'Графики есть, картинки нет',
    hint: 'График на ровном фоне. Читается лучше всего, но карточка теряет лицо темы.',
    opts: { views: ALL, page: 0, background: false },
  },
  {
    name: 'Отключено всё',
    hint: 'Показывать нечего — карточка сжимается до шапки и цифр дня.',
    opts: { views: [], page: 0, background: false },
  },
];

const root = document.getElementById('root');

for (const c of cases) {
  const h = document.createElement('h2');
  h.className = 'section';
  h.textContent = c.name;

  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = c.hint;

  const box = document.createElement('div');
  box.innerHTML = cardHtml({ series, ...c.opts });

  root.append(h, note, box);
}
