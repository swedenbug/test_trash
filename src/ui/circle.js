/*
  circle.js — кружок модуля для ряда историй.
  Назначение: отрисовать одно состояние кружка. Функция чистая: на входе
  описание состояния, на выходе SVG. Данных не читает, событий не слушает.
  Зависимости: нет.

  В кружке два независимых указателя:
    кольцо по краю — срочность (давно ли занимался),
    фигура внутри — прогресс дня (сколько от нормы).
*/

let seq = 0;

/* Геометрия в системе координат 100×100.
   Между кольцом состояния и подложкой оставлен зазор: кольцо читается как
   отдельный указатель, а не как обводка содержимого. */
const R_RING = 46;   // осевая линия кольца
const W_RING = 4;    // толщина кольца
const R_DISC = 38;   // подложка под фигурой, зазор до кольца — 6

/* Кольцо состояния. Серый повторяет приглушённый стиль, к которому привык
   глаз в мессенджерах: он не должен спорить с содержимым.
   Зелёный и красный — с переходом, иначе на чёрном фоне кольцо выглядит
   нарисованным маркером. */
const RING = {
  done: { flat: '#303c4a' },
  soft: { from: '#3ce07e', to: '#0e9e6a' },
  hard: { from: '#ff6b4a', to: '#b3121f' },
};

/* Капля: остриё сверху, круглое основание снизу. Система координат 100×100.
   Экспортируется: та же фигура служит эмблемой модуля в карточках и меню. */
export const DROP = 'M50 8 C50 8 78 42 78 60 A28 28 0 1 1 22 60 C22 42 50 8 50 8 Z';

/**
 * @param {object} o
 * @param {number} o.size     диаметр в пикселях
 * @param {'done'|'soft'|'hard'} o.level   уровень срочности
 * @param {number} o.fill     прогресс дня, 0…1 и выше
 * @param {number|null} o.percent  число поверх фигуры либо null
 * @param {{lap:1|2, progress:number}|null} o.hold  состояние удержания
 * @param {'normal'|'loading'|'error'} o.state
 * @param {string|null} o.glyph  буква вместо фигуры — для тем без утверждённой эмблемы
 * @param {string} o.color       цвет темы
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
} = {}) {
  const id = `c${++seq}`;
  const ring = RING[level] ?? RING.done;
  const stroke = ring.flat ? ring.flat : `url(#${id}-ring)`;
  const clamped = Math.max(0, Math.min(1, fill));
  const over = fill > 1;

  /* Поверхность жидкости отсчитывается по телу капли, а не по всей высоте.
     Иначе последние проценты приходятся на узкое остриё: девяносто процентов
     и полная капля выглядят одинаково, а разница между ними существенная. */
  const TOP = 8, BOTTOM = 88;
  const surface = BOTTOM - clamped * (BOTTOM - TOP);

  const parts = [];

  parts.push(`
    <defs>
      <clipPath id="${id}-drop"><path d="${DROP}"/></clipPath>
      <filter id="${id}-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="7"/>
      </filter>
      <filter id="${id}-glow-near" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="3"/>
      </filter>
      ${ring.flat ? '' : `<linearGradient id="${id}-ring" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="${ring.from}"/>
        <stop offset="1" stop-color="${ring.to}"/>
      </linearGradient>`}
    </defs>`);

  /* Кольцо срочности */
  const ringOpacity = state === 'loading' ? 0.35 : 1;
  parts.push(`<circle cx="50" cy="50" r="${R_RING}" fill="none"
      stroke="${state === 'error' ? 'var(--c-line)' : stroke}"
      stroke-width="${W_RING}" opacity="${ringOpacity}"/>`);

  /* Подложка под фигурой */
  parts.push(`<circle cx="50" cy="50" r="${R_DISC}" fill="var(--c-surface)"/>`);

  /* Фигура прогресса. Буква — временная эмблема темы, по которой ещё нет брифа. */
  const dropOpacity = state === 'loading' ? 0.25 : 1;

  if (glyph) {
    parts.push(`<text x="50" y="52" text-anchor="middle" dominant-baseline="central"
        font-family="var(--f-geo)" font-size="34" fill="${color}"
        opacity="${state === 'loading' ? 0.25 : 0.75}">${glyph}</text>`);
  } else {
    parts.push(`<g transform="translate(50 50) scale(0.75) translate(-50 -50)" opacity="${dropOpacity}">`);

    if (over && state === 'normal') {
      parts.push(`<path d="${DROP}" fill="${color}" filter="url(#${id}-glow)"/>`);
      parts.push(`<path d="${DROP}" fill="${color}" filter="url(#${id}-glow-near)"/>`);
    }

    const outline = state === 'error' ? 0.18 : 0.4;
    parts.push(`<path d="${DROP}" fill="none" stroke="${color}" stroke-width="3" opacity="${outline}"/>`);

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

function arc(id, lengthPercent, color, opacity) {
  return `<circle cx="50" cy="50" r="${R_RING}" fill="none"
      stroke="${color}" stroke-width="${W_RING}" stroke-linecap="round"
      pathLength="100" stroke-dasharray="${lengthPercent} 100"
      opacity="${opacity}" transform="rotate(-90 50 50)"/>`;
}
