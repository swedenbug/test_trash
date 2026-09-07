/*
  circle.js - кружок модуля для ряда историй.
  Назначение: отрисовать одно состояние кружка. Функция чистая: на входе
  описание состояния, на выходе SVG. Данных не читает, событий не слушает.
  Зависимости: нет.

  В кружке два независимых указателя:
    кольцо по краю - срочность (давно ли занимался),
    фигура внутри - прогресс дня (сколько от нормы).
*/

let seq = 0;

/* Геометрия в системе координат 100×100.
   Между кольцом состояния и подложкой оставлен зазор: кольцо читается как
   отдельный указатель, а не как обводка содержимого. */
const R_RING = 46;   // осевая линия кольца
const W_RING = 4;    // толщина кольца
const R_DISC = 38;   // подложка под фигурой, зазор до кольца - 6

/* Кольцо состояния. Серый повторяет приглушённый стиль, к которому привык
   глаз в мессенджерах: он не должен спорить с содержимым.
   Зелёный и красный - с переходом, иначе на чёрном фоне кольцо выглядит
   нарисованным маркером. */
const RING = {
  done: { flat: '#303c4a' },
  soft: { from: '#4ef29a', to: '#0a8f5c', glow: '#2ecb7f' },
  hard: { from: '#ff7a55', to: '#a30f1e', glow: '#e0402e' },
};

/* Фигура внутри кружка - знак темы из общего набора.
   Капля остаётся значением по умолчанию и экспортируется: та же фигура
   служит эмблемой в карточках и в меню. */
import { EMBLEMS, DETAILS, BOXES, fitTransform } from './emblems.js';

export const DROP = EMBLEMS.drop.path;

function shape(emblem) {
  return (EMBLEMS[emblem] ?? EMBLEMS.drop).path;
}

/**
 * @param {object} o
 * @param {number} o.size     диаметр в пикселях
 * @param {'done'|'soft'|'hard'} o.level   уровень срочности
 * @param {number} o.fill     прогресс дня, 0…1 и выше
 * @param {number|null} o.percent  число поверх фигуры либо null
 * @param {{lap:1|2, progress:number}|null} o.hold  состояние удержания
 * @param {'normal'|'loading'|'error'} o.state
 * @param {string|null} o.glyph  буква вместо фигуры - для тем без утверждённой эмблемы
 * @param {string} o.color       цвет темы
 * @param {string} o.emblem      знак темы из набора
 * @param {'fill'|'solid'|'detail'|'letter'|'value'|'percent'} o.content
 *        чем заполнен кружок внутри кольца
 * @param {string} o.text        буква или цифры для content = 'letter'
 * @param {number} o.value       текущее значение для content = 'value'
 * @param {number} o.goal        норма для content = 'value'
 */
export function circleSvg({
  size = 72,
  level = 'done',
  fill = 0,
  percent = null,
  hold = null,
  state = 'normal',
  glyph = null,
  color = 'var(--c-mod-water)',
  emblem = 'drop',
  content = 'fill',
  text = '',
  value = 0,
  goal = 0,
} = {}) {
  const id = `c${++seq}`;
  const ring = RING[level] ?? RING.done;
  const stroke = ring.flat ? ring.flat : `url(#${id}-ring)`;
  const clamped = Math.max(0, Math.min(1, fill));
  const over = fill > 1;

  /* Поверхность жидкости отсчитывается по телу знака, а не по всей высоте
     поля. Иначе у капли последние проценты приходятся на узкое остриё:
     девяносто процентов и полная капля выглядят одинаково. Границы берутся
     из измеренных габаритов - у каждого знака они свои. */
  const gb = BOXES[emblem] ?? [22, 8, 56, 80];
  const TOP = gb[1], BOTTOM = gb[1] + gb[3];
  const surface = BOTTOM - clamped * (BOTTOM - TOP);

  const parts = [];

  parts.push(`
    <defs>
      <clipPath id="${id}-drop"><path d="${shape(emblem)}"/></clipPath>
      <filter id="${id}-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="7"/>
      </filter>
      <filter id="${id}-glow-near" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="3"/>
      </filter>
      <filter id="${id}-ringglow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3.5"/>
      </filter>
      ${ring.flat ? '' : `<linearGradient id="${id}-ring" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="${ring.from}"/>
        <stop offset="1" stop-color="${ring.to}"/>
      </linearGradient>`}
    </defs>`);

  /* Кольцо срочности */
  const ringOpacity = state === 'loading' ? 0.35 : 1;

  /* Свечение под цветным кольцом. Кольцо в четыре сотых диаметра само по себе
     теряется на чёрном; ореол возвращает ему вес, не утолщая линию. */
  if (ring.glow && state === 'normal') {
    parts.push(`<circle cx="50" cy="50" r="${R_RING}" fill="none"
        stroke="${ring.glow}" stroke-width="7" opacity="0.5"
        filter="url(#${id}-ringglow)"/>`);
  }

  parts.push(`<circle cx="50" cy="50" r="${R_RING}" fill="none"
      stroke="${state === 'error' ? 'var(--c-line)' : stroke}"
      stroke-width="${W_RING}" opacity="${ringOpacity}"/>`);

  /* Подложка под фигурой */
  parts.push(`<circle cx="50" cy="50" r="${R_DISC}" fill="var(--c-surface)"/>`);

  /* Наполнение кружка. Заливка полезна там, где есть дневная норма;
     где нормы нет, она ничего не сообщает - тогда подробный знак или число. */
  const dropOpacity = state === 'loading' ? 0.25 : 1;
  const dim = state === 'loading' ? 0.25 : 1;

  if (content === 'detail' && state === 'normal') {
    const d = DETAILS[emblem] ?? DETAILS.target;
    parts.push(`<g transform="translate(50 50) scale(0.54) translate(-50 -50)"
        fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
        stroke-linejoin="round" style="color:${color}" opacity="${dim}">${d.svg}</g>`);
  } else if (content === 'solid' && state === 'normal') {
    parts.push(`<g transform="${fitTransform(emblem, 54)}" opacity="${dim}">
        <path d="${shape(emblem)}" fill="${color}"/></g>`);
  } else if (content === 'letter' && state === 'normal') {
    parts.push(label(text.slice(0, 2), text.length > 1 ? 30 : 38, color, dim));
  } else if (content === 'value' && state === 'normal') {
    parts.push(label(String(value), 24, 'var(--c-ink)', dim, -6));
    parts.push(label(`из ${goal}`, 15, 'var(--c-muted)', dim, 16));
  } else if (content === 'percent' && state === 'normal') {
    parts.push(label(`${Math.round((fill || 0) * 100)}%`, 26, 'var(--c-ink)', dim));
  } else if (glyph) {
    parts.push(`<text x="50" y="52" text-anchor="middle" dominant-baseline="central"
        font-family="var(--f-geo)" font-size="34" fill="${color}"
        opacity="${state === 'loading' ? 0.25 : 0.75}">${glyph}</text>`);
  } else {
    parts.push(`<g transform="${fitTransform(emblem, 54)}" opacity="${dropOpacity}">`);

    if (over && state === 'normal') {
      parts.push(`<path d="${shape(emblem)}" fill="${color}" filter="url(#${id}-glow)"/>`);
      parts.push(`<path d="${shape(emblem)}" fill="${color}" filter="url(#${id}-glow-near)"/>`);
    }

    const outline = state === 'error' ? 0.18 : 0.4;
    parts.push(`<path d="${shape(emblem)}" fill="none" stroke="${color}" stroke-width="3" opacity="${outline}"/>`);

    if (clamped > 0 && state === 'normal') {
      parts.push(`<g clip-path="url(#${id}-drop)">
          <rect x="0" y="${surface}" width="100" height="${100 - surface}" fill="${color}"/>
        </g>`);
    }

    parts.push('</g>');
  }

  /* Знак отказа вместо показаний */
  if (state === 'error') {
    parts.push(`<text x="50" y="50" text-anchor="middle" dominant-baseline="central"
        font-family="var(--f-body)" font-size="34" font-weight="600"
        fill="var(--c-danger)">!</text>`);
  }

  /* Процент поверх фигуры */
  if (percent !== null && state === 'normal') {
    parts.push(`<circle cx="50" cy="50" r="${R_DISC}" fill="var(--c-bg)" opacity="0.74"/>`);
    parts.push(`<text x="50" y="50" text-anchor="middle" dominant-baseline="central"
        font-family="var(--f-num)" font-size="26" font-weight="600"
        fill="var(--c-ink)">${percent}%</text>`);
  }

  /* Кольца удержания. pathLength=100 позволяет задавать длину дуги в процентах. */
  if (hold) {
    const p = Math.max(0, Math.min(1, hold.progress)) * 100;

    if (hold.lap === 1) {
      parts.push(arc(id, p, color, 1));
    } else {
      // Второй круг: набранный литр гаснет по мере заполнения перехода.
      parts.push(arc(id, 100, color, 1 - p / 100));
      parts.push(arc(id, p, 'var(--c-chrome)', 1));
    }
  }

  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}"
      xmlns="http://www.w3.org/2000/svg" role="img">${parts.join('')}</svg>`;
}

/* Текст по центру кружка. Отдельной функцией, потому что вариантов наполнения
   с текстом три, и выравнивание у них должно быть одинаковым. */
function label(textValue, size, color, opacity, dy = 0) {
  return `<text x="50" y="${50 + dy}" text-anchor="middle" dominant-baseline="central"
      font-family="var(--f-geo)" font-size="${size}" font-weight="500"
      fill="${color}" opacity="${opacity}">${textValue}</text>`;
}

function arc(id, lengthPercent, color, opacity) {
  return `<circle cx="50" cy="50" r="${R_RING}" fill="none"
      stroke="${color}" stroke-width="${W_RING}" stroke-linecap="round"
      pathLength="100" stroke-dasharray="${lengthPercent} 100"
      opacity="${opacity}" transform="rotate(-90 50 50)"/>`;
}
