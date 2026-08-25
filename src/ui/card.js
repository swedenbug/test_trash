/*
  card.js — карточка модуля в ленте главного экрана.
  Назначение: свёрнутый вид модуля. Приглушённое изображение на фоне,
  сверху график и процент, снизу цифры дня.
  Зависимости: circle.js (фигура капли), chart.js.
  Данных не читает: на входе готовые числа, на выходе разметка.
*/

import { DROP } from './circle.js';
import { dayCumulative, weekCumulative, weekBars } from './chart.js';

/* Заглушка вместо неподгруженного изображения. Пока пользователь ничего
   не выбрал, фон честно сообщает, что картинки нет, а не притворяется фоном. */
function placeholder() {
  return `
    <svg class="card__ph" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2" y="2" width="60" height="44" rx="4" fill="none"
            stroke="var(--c-line)" stroke-width="2"/>
      <circle cx="20" cy="17" r="4.5" fill="var(--c-line)"/>
      <path d="M6 40 L24 24 L36 34 L46 27 L58 40 Z" fill="var(--c-line)"/>
    </svg>`;
}

function emblem(glyph, color) {
  if (glyph) {
    return `<span class="card__emblem card__emblem--letter" style="color:${color}">${glyph}</span>`;
  }
  return `
    <svg class="card__emblem" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="${DROP}" fill="${color}"/>
    </svg>`;
}

function dots(active, total) {
  if (total < 2) return '';        // одна страница — листать нечего
  return `<div class="card__dots">${
    Array.from({ length: total }, (_, i) =>
      `<button type="button" class="card__dot${i === active ? ' is-on' : ''}"
         data-page="${i}" aria-label="Страница ${i + 1}"></button>`).join('')
  }</div>`;
}

/** Внутренности блока графика. Вынесены отдельно, чтобы листание
    перерисовывало только их, не трогая остальной экран. */
export function chartBlock({ views = [], page = 0, series = {}, goal = 1 } = {}) {
  const chart = views[page] ?? null;
  if (!chart) return '';

  let graph = '';
  if (chart === 'week-bars') graph = weekBars(series.week ?? []);
  else if (chart === 'week-line') graph = weekCumulative(series.weekCumulative ?? [], goal * 7);
  else if (chart === 'day-line') graph = dayCumulative(series.cumulative ?? [], goal);

  return graph + dots(page, views.length);
}

/* Что показывать в карточке. Четыре переключателя, независимых друг от друга:
   фоновая картинка, график дня, график недели, столбики недели.
   Каждый настраивается для каждой темы отдельно. */
export function availableViews({ dayLine = true, weekLine = true, weekBars = true } = {}) {
  const views = [];
  if (dayLine) views.push('day-line');
  if (weekLine) views.push('week-line');
  if (weekBars) views.push('week-bars');
  return views;
}

/**
 * @param {object} o
 * @param {string} o.title        название модуля
 * @param {string} o.description  что именно считает карточка
 * @param {number} o.value        выпито, мл
 * @param {number} o.goal         норма, мл
 * @param {string} o.foot         подпись внизу
 * @param {object} o.series       данные для графика
 * @param {string[]} o.views      включённые страницы графика, по порядку
 * @param {number} o.page         какая страница показана сейчас
 * @param {boolean} o.background  показывать ли фоновое изображение
 */
export function cardHtml({
  theme = '',
  title = 'Вода',
  description = 'Ежедневная норма выпивания воды',
  value = 1250,
  goal = 2500,
  foot = 'последний приём 40 минут назад',
  series = {},
  page = 0,
  views = ['day-line', 'week-line', 'week-bars'],
  background = true,
  unit = 'мл',
  glyph = null,
  color = 'var(--c-mod-water)',
} = {}) {
  const pct = Math.round((value / goal) * 100);

  /* Карточка сжимается, только когда показывать нечего вовсе.
     Картинка есть — высота сохраняется, иначе её не разглядеть. */
  const flat = !background && views.length === 0;

  return `
    <article class="card${flat ? ' card--flat' : ''}" data-theme="${theme}">
      ${background ? `<div class="card__bg">${placeholder()}</div><div class="card__scrim"></div>` : ''}

      <div class="card__top">
        <div class="card__head">
          ${emblem(glyph, color)}
          <div class="card__names">
            <span class="card__title">${title}</span>
            <span class="card__desc">${description}</span>
          </div>
          <span class="card__pct">${pct}<small>%</small></span>
        </div>
        <div class="card__chart">${chartBlock({ views, page, series, goal })}</div>
      </div>

      <div class="card__body">
        <div class="card__num"><b>${value}</b><span>из ${goal} ${unit}</span></div>
        <div class="card__bar"><i style="width:${Math.min(100, pct)}%;background:${color}"></i></div>
        <div class="card__foot">${foot}</div>
      </div>
    </article>`;
}
