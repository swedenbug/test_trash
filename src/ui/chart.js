/*
  chart.js — графики для карточек модулей.
  Назначение: превратить ряд чисел в SVG. Функции чистые, данных не читают.
  Зависимости: нет.

  Линии и столбики белые: график лежит поверх приглушённого изображения,
  и цвет модуля на нём терялся бы. Цвет модуля остаётся в эмблеме и полосе.
*/

const W = 320;
const H = 88;
const PAD_B = 16;   // место под подписи оси
const PAD_T = 6;
const PAD_X = 12;   // иначе крайние подписи обрезаются краем карточки

function frame(inner, labels) {
  const marks = labels.map(({ x, text }) =>
    `<text x="${x}" y="${H - 2}" text-anchor="middle"
       font-family="var(--f-body)" font-size="9"
       fill="var(--c-faint)">${text}</text>`).join('');

  /* Без preserveAspectRatio="none": при растяжении по горизонтали
     подписи осей расплываются вширь и становятся нечитаемыми. */
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}${marks}</svg>`;
}

function normLine(y) {
  return `<line x1="0" y1="${y}" x2="${W}" y2="${y}"
      stroke="var(--c-muted)" stroke-width="1" stroke-dasharray="3 4"
      vector-effect="non-scaling-stroke" opacity="0.7"/>`;
}

/**
 * Накопительная линия за день. Отвечает на вопрос «успеваю ли к вечеру».
 * Заливки под линией нет: она лежит поверх изображения и мутит его.
 * @param {{hour:number, ml:number}[]} points  накопленный объём по часам
 */
export function dayCumulative(points, goal, { from = 6, to = 24 } = {}) {
  const top = Math.max(goal, ...points.map((p) => p.ml)) * 1.12;
  const x = (h) => PAD_X + ((h - from) / (to - from)) * (W - PAD_X * 2);
  const y = (ml) => PAD_T + (1 - ml / top) * (H - PAD_B - PAD_T);

  return frame(
    line(points.map((p) => [x(p.hour), y(p.ml)]), y(goal)),
    [from, 12, 18, to].map((h) => ({ x: x(h), text: `${h}` })),
  );
}

/**
 * Накопительная линия за неделю. Отвечает на вопрос «набираю ли недельный объём».
 * @param {{day:string, ml:number}[]} days  накопленный объём по дням
 */
export function weekCumulative(days, weekGoal) {
  const top = Math.max(weekGoal, ...days.map((d) => d.ml)) * 1.12;
  const step = (W - PAD_X * 2) / (days.length - 1 || 1);
  const x = (i) => PAD_X + step * i;
  const y = (ml) => PAD_T + (1 - ml / top) * (H - PAD_B - PAD_T);

  return frame(
    line(days.map((d, i) => [x(i), y(d.ml)]), y(weekGoal)),
    days.map((d, i) => ({ x: x(i), text: d.day })),
  );
}

/* Общая отрисовка линии: пунктир нормы, сама линия, точка на последнем значении. */
function line(pts, normY) {
  if (!pts.length) return normLine(normY);
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return `${normLine(normY.toFixed(1))}
    <path d="${d}" fill="none" stroke="var(--c-chrome)" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="var(--c-chrome)"/>`;
}

/**
 * Неделя. Столбик — доля нормы за день.
 * @param {{day:string, pct:number, today?:boolean}[]} days
 */
export function weekBars(days) {
  const top = Math.max(120, ...days.map((d) => d.pct)) * 1.1;
  const step = (W - PAD_X * 2) / days.length;
  const h2y = (pct) => (pct / top) * (H - PAD_B - PAD_T);
  const normY = PAD_T + (H - PAD_B - PAD_T) - h2y(100);

  const bars = days.map((d, i) => {
    const height = h2y(d.pct);
    const cx = PAD_X + step * (i + 0.5);
    return `<rect x="${(cx - 11).toFixed(1)}" y="${(H - PAD_B - height).toFixed(1)}"
        width="22" height="${height.toFixed(1)}" rx="3"
        fill="var(--c-chrome)" opacity="${d.today ? 1 : 0.55}"/>`;
  }).join('');

  return frame(
    `${normLine(normY.toFixed(1))}${bars}`,
    days.map((d, i) => ({ x: PAD_X + step * (i + 0.5), text: d.day })),
  );
}
