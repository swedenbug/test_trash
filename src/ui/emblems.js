/*
  emblems.js - набор знаков для тем.
  Назначение: одна фигура на тему. Выбирается пользователем, красится в цвет темы.
  Зависимости: нет.

  Все знаки - сплошные силуэты, а не контуры. Причина в размере: на кружке
  в семьдесят два пикселя контурный знак превращается в кашу, а силуэт
  читается и в тридцать.

  Ловушка дуг: у дуги радиус не может быть меньше половины хорды. Меньший
  радиус браузер молча увеличивает, дуги совпадают и фигура исчезает -
  на витрине это выглядит как пустая клетка, а не как ошибка.

  Второе требование важнее первого: силуэт должен **заполняться снизу вверх**,
  как капля у воды. Поэтому фигуры компактные, без тонких отростков и длинных
  перемычек - у такой формы уровень заливки виден, у ветвистой нет.
*/

export const EMBLEMS = {
  drop: { name: 'Капля', path: 'M50 8 C50 8 78 42 78 60 A28 28 0 1 1 22 60 C22 42 50 8 50 8 Z' },
  glass: { name: 'Стакан', path: 'M30 18 H70 L63 84 A7 7 0 0 1 56 90 H44 A7 7 0 0 1 37 84 Z' },
  bottle: { name: 'Бутылка', path: 'M43 8 H57 V22 C57 28 66 33 66 43 V80 A10 10 0 0 1 56 90 H44 A10 10 0 0 1 34 80 V43 C34 33 43 28 43 22 Z' },
  cup: { name: 'Чашка', path: 'M22 32 H66 V60 A22 22 0 0 1 44 82 A22 22 0 0 1 22 60 Z M66 38 A15 15 0 0 1 66 68 V58 A6 6 0 0 0 66 48 Z M14 86 H74 V92 H14 Z' },
  apple: { name: 'Яблоко', path: 'M50 30 C40 18 18 24 18 47 C18 69 33 90 50 90 C67 90 82 69 82 47 C82 24 60 18 50 30 Z M50 30 C50 19 55 10 64 7 C62 19 58 27 50 30 Z' },
  flame: { name: 'Огонь', path: 'M50 6 C58 26 78 34 78 55 A28 28 0 0 1 22 55 C22 42 33 36 39 25 C42 38 48 34 48 21 C48 15 49 10 50 6 Z' },
  leaf: { name: 'Лист', path: 'M86 12 C46 12 16 33 16 62 C16 75 25 85 38 88 C38 61 57 40 79 33 C58 44 46 62 46 88 C70 85 86 58 86 12 Z' },
  heart: { name: 'Сердце', path: 'M50 88 C18 66 10 50 10 37 A21 21 0 0 1 50 25 A21 21 0 0 1 90 37 C90 50 82 66 50 88 Z' },
  dumbbell: { name: 'Гантель', path: 'M30 43 H70 V57 H30 Z M14 32 H28 V68 H14 Z M72 32 H86 V68 H72 Z M6 41 H13 V59 H6 Z M87 41 H94 V59 H87 Z' },
  shoe: { name: 'Кроссовок', path: 'M12 64 C12 56 18 51 27 49 L47 41 L57 28 L67 33 L62 47 L84 56 C90 59 93 63 93 70 V78 H12 Z' },
  mountain: { name: 'Гора', path: 'M6 84 L34 32 L50 58 L62 40 L94 84 Z' },
  check: { name: 'Галочка', path: 'M16 50 L38 72 L84 20 L94 31 L38 92 L6 61 Z' },
  book: { name: 'Книга', path: 'M16 20 H42 C46 20 49 24 49 28 V82 C49 78 46 75 42 75 H16 Z M84 20 H58 C54 20 51 24 51 28 V82 C51 78 54 75 58 75 H84 Z' },
  bulb: { name: 'Лампочка', path: 'M50 8 A27 27 0 0 0 34 56 C38 62 40 67 40 73 H60 C60 67 62 62 66 56 A27 27 0 0 0 50 8 Z M40 78 H60 V84 A7 7 0 0 1 53 91 H47 A7 7 0 0 1 40 84 Z' },
  pen: { name: 'Ручка', path: 'M14 88 L22 64 L62 24 L78 40 L38 80 Z M66 20 L82 36 L90 28 A11 11 0 0 0 74 12 Z' },
  note: { name: 'Нота', path: 'M74 6 L38 16 V64 A13 11 0 1 0 46 74 V32 L74 24 Z' },
  star: { name: 'Звезда', path: 'M50.0 8.0 L60.6 37.4 L91.8 38.4 L67.1 57.6 L75.9 87.6 L50.0 70.0 L24.1 87.6 L32.9 57.6 L8.2 38.4 L39.4 37.4 Z' },
  moon: { name: 'Луна', path: 'M66 14 A42 42 0 1 0 66 86 A36 36 0 0 1 66 14 Z' },
  bed: { name: 'Сон', path: 'M8 50 H88 A6 6 0 0 1 94 56 V74 H8 Z M8 74 H18 V86 H8 Z M84 74 H94 V86 H84 Z M18 34 H44 V50 H18 Z M8 34 H16 V74 H8 Z' },
  pill: { name: 'Таблетка', path: 'M28 32 H72 A23 23 0 0 1 72 78 H28 A23 23 0 0 1 28 32 Z' },
  sun: { name: 'Солнце', path: 'M72.0 50.0 A22 22 0 1 1 72.0 49.9 Z M71.6 45.8 L92.0 50.0 L71.6 54.2 Z M68.2 62.3 L79.7 79.7 L62.3 68.2 Z M54.2 71.6 L50.0 92.0 L45.8 71.6 Z M37.7 68.2 L20.3 79.7 L31.8 62.3 Z M28.4 54.2 L8.0 50.0 L28.4 45.8 Z M31.8 37.7 L20.3 20.3 L37.7 31.8 Z M45.8 28.4 L50.0 8.0 L54.2 28.4 Z M62.3 31.8 L79.7 20.3 L68.2 37.7 Z' },
  phone: { name: 'Телефон', path: 'M32 6 H68 A9 9 0 0 1 77 15 V85 A9 9 0 0 1 68 94 H32 A9 9 0 0 1 23 85 V15 A9 9 0 0 1 32 6 Z' },
  cigarette: { name: 'Сигарета', path: 'M8 56 H70 V74 H8 Z M76 56 H92 V74 H76 Z M34 24 A10 10 0 0 1 34 44 A10 10 0 0 0 34 48 Z' },
  shield: { name: 'Щит', path: 'M50 6 L86 19 V50 C86 72 70 85 50 94 C30 85 14 72 14 50 V19 Z' }
};

export const EMBLEM_IDS = Object.keys(EMBLEMS);

/*
  Габариты каждого знака, снятые браузером: x, y, ширина, высота.
  Нужны потому, что фигуры нарисованы по-разному: бутылка узкая и высокая,
  чашка широкая и низкая. Без выравнивания одни знаки в кружке выглядят
  крупнее других и съезжают от центра.
*/
export const BOXES = {
  drop: [22, 8, 56, 80],
  glass: [30, 18, 40, 72],
  bottle: [34, 8, 32, 82],
  cup: [14, 32, 67, 60],
  apple: [18, 7, 64, 83],
  flame: [22, 6, 56, 77],
  leaf: [16, 12, 70, 76],
  heart: [9.6, 12.1, 80.7, 75.9],
  dumbbell: [6, 32, 88, 36],
  shoe: [12, 28, 81, 50],
  mountain: [6, 32, 88, 52],
  check: [6, 20, 88, 72],
  book: [16, 20, 68, 62],
  bulb: [23.9, 8, 52.1, 83],
  pen: [14, 8.7, 79.3, 79.3],
  note: [20, 6, 54, 79.2],
  star: [8.2, 8, 83.6, 79.6],
  moon: [2.4, 8, 63.6, 84],
  bed: [8, 34, 86, 52],
  pill: [5, 32, 90, 46],
  sun: [8, 8, 84, 84],
  phone: [23, 6, 54, 88],
  cigarette: [8, 24, 84, 50],
  shield: [14, 6, 72, 88]
};

/**
 * Приводит знак к общему полю: центрирует и подгоняет под заданный размер.
 * Возвращает строку transform.
 */
export function fitTransform(id, side = 56) {
  const b = BOXES[id];
  if (!b) return '';
  const [x, y, w, h] = b;
  const k = side / Math.max(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `translate(50 50) scale(${k.toFixed(4)}) translate(${-cx} ${-cy})`;
}

/*
  Второй набор - подробные знаки. Они не заливаются: линии, отдельные части,
  тонкие детали. Зато рисуют то, что силуэтом не покажешь - бегущего человека,
  велосипед, мишень, циферблат.

  Выбор между наборами - за пользователем. Заливка полезна там, где есть
  дневная норма; там, где нормы нет, она ничего не сообщает, и подробный
  знак понятнее.
*/
export const DETAILS = {
  run:      { name: 'Бег',       svg: '<circle cx="62" cy="16" r="9"/><path d="M56 32 L44 44 L28 40 M56 32 L70 38 L78 56 M56 32 L58 52 L72 68 L66 84 M58 52 L40 60 L30 80"/>' },
  bike:     { name: 'Велосипед', svg: '<circle cx="24" cy="68" r="18"/><circle cx="76" cy="68" r="18"/><path d="M24 68 L44 40 H64 L76 68 M44 40 L36 68 M58 30 H70 M64 40 L44 68"/><circle cx="60" cy="24" r="6"/>' },
  target:   { name: 'Мишень',    svg: '<circle cx="50" cy="50" r="38"/><circle cx="50" cy="50" r="22"/><circle cx="50" cy="50" r="7" fill="currentColor"/>' },
  clock:    { name: 'Часы',      svg: '<circle cx="50" cy="52" r="36"/><path d="M50 30 V52 L68 62"/><path d="M36 10 L28 18 M64 10 L72 18"/>' },
  scales:   { name: 'Весы',      svg: '<rect x="14" y="20" width="72" height="64" rx="12"/><rect x="34" y="36" width="32" height="18" rx="4"/><path d="M30 68 H70"/>' },
  cutlery:  { name: 'Приборы',   svg: '<path d="M28 12 V40 A8 8 0 0 0 44 40 V12 M36 40 V88 M28 12 V30 M44 12 V30"/><path d="M70 12 C82 20 82 38 70 46 V88"/>' },
  medal:    { name: 'Медаль',    svg: '<circle cx="50" cy="64" r="24"/><path d="M34 44 L22 10 H40 L50 34 M66 44 L78 10 H60 L50 34"/><path d="M50 54 L54 62 H62 L56 68 L58 76 L50 72 L42 76 L44 68 L38 62 H46 Z" fill="currentColor" stroke="none"/>' },
  barbell:  { name: 'Штанга',    svg: '<path d="M8 50 H92 M22 30 V70 M34 22 V78 M66 22 V78 M78 30 V70"/>' },
  flag:     { name: 'Флаг',      svg: '<path d="M24 88 V12 M24 16 H80 L68 34 L80 52 H24"/>' },
  tooth:    { name: 'Зуб',       svg: '<path d="M26 22 C38 12 62 12 74 22 C82 30 78 46 74 58 C70 72 66 88 58 88 C52 88 52 66 50 66 C48 66 48 88 42 88 C34 88 30 72 26 58 C22 46 18 30 26 22 Z"/>' },
  wallet:   { name: 'Кошелёк',   svg: '<rect x="12" y="26" width="76" height="52" rx="10"/><path d="M12 40 H70 A8 8 0 0 1 78 48 V56 A8 8 0 0 1 70 64 H12"/><circle cx="66" cy="52" r="4" fill="currentColor"/>' },
  timer:    { name: 'Таймер',    svg: '<circle cx="50" cy="56" r="32"/><path d="M50 36 V56 M38 12 H62 M50 12 V24 M76 30 L84 22"/>' },
};

export const DETAIL_IDS = Object.keys(DETAILS);

/** Подробный знак. Заливки не имеет - рисуется линиями. */
export function detailSvg(id, { size = 24, color = 'var(--c-ink)' } = {}) {
  const d = DETAILS[id] ?? DETAILS.target;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"
      fill="none" stroke="${color}" stroke-width="7"
      stroke-linecap="round" stroke-linejoin="round"
      style="color:${color}">${d.svg}</svg>`;
}

/**
 * Знак темы. Если задан fill от нуля до единицы - заполняется снизу вверх,
 * остальное показывается приглушённым контуром.
 */
let seq = 0;

export function emblemSvg(id, { size = 24, color = 'var(--c-ink)', fill = null } = {}) {
  const e = EMBLEMS[id] ?? EMBLEMS.drop;
  const key = EMBLEMS[id] ? id : 'drop';
  const uid = `e${++seq}`;
  const fit = fitTransform(key, 76);

  if (fill === null) {
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
      <g transform="${fit}"><path d="${e.path}" fill="${color}"/></g></svg>`;
  }

  const level = Math.max(0, Math.min(1, fill));
  const [, y, , h] = BOXES[key];
  const surface = y + h - level * h;

  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    <defs><clipPath id="${uid}"><path d="${e.path}"/></clipPath></defs>
    <g transform="${fit}">
      <path d="${e.path}" fill="none" stroke="${color}" stroke-width="3" opacity="0.4"/>
      <g clip-path="url(#${uid})">
        <rect x="0" y="${surface}" width="100" height="${100 - surface}" fill="${color}"/>
      </g>
    </g>
  </svg>`;
}
