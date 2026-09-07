/*
  today.js - макет второй вкладки.
  Назначение: показать, что требует внимания сегодня, что уже сделано,
  и как идут цели.
  Зависимости: circle.js, emblems.js. Данных не читает - это макет.

  Порядок строк - по срочности, как в ряду кружков. Сделанное не исчезает,
  а гаснет и уходит вниз: важно видеть, что день не пустой.
*/

import { circleSvg } from './circle.js';

const themes = [
  { id: 'water',   name: 'Водный баланс', sum: '500 из 2500 мл', level: 'hard',
    fill: 0.2, color: '#58b6ee', emblem: 'drop', content: 'fill', quick: '+250' },
  { id: 'push',    name: 'Отжимания', sum: '20 из 50 раз', level: 'soft',
    fill: 0.4, color: '#35bf6b', emblem: 'dumbbell', content: 'fill', quick: '+10',
    group: 'Спорт' },
  { id: 'read',    name: 'Чтение', sum: '12 из 30 минут', level: 'soft',
    fill: 0.4, color: '#b06fe8', emblem: 'book', content: 'fill', quick: 'Таймер' },
  { id: 'coffee',  name: 'Кофе', sum: '2 из 3 чашек, не более', level: 'done',
    fill: 0.66, color: '#e0a32e', emblem: 'cup', content: 'fill', quick: '+1' },
  { id: 'mood',    name: 'Настроение', sum: 'ещё не отмечено', level: 'done',
    fill: 0, color: '#43c9c0', emblem: 'heart', content: 'solid', quick: 'Оценить' },
];

const done = [
  { id: 'charge', name: 'Зарядка', sum: 'сделано в 7:40', level: 'done',
    fill: 1, color: '#35bf6b', emblem: 'check', content: 'fill', group: 'Спорт' },
  { id: 'pills',  name: 'Витамины', sum: 'сделано в 9:05', level: 'done',
    fill: 1, color: '#e86fa8', emblem: 'pill', content: 'fill' },
];

const goals = [
  { name: 'Норма воды ежедневно', theme: 'Водный баланс', color: '#58b6ee',
    day: 24, days: 90, used: 2, budget: 9 },
  { name: 'Отжимания три раза в неделю', theme: 'Отжимания', color: '#35bf6b',
    day: 11, days: 60, used: 5, budget: 6 },
];

const CREDIT = 14;

function row(t, dim = false) {
  return `
    <li class="trow${dim ? ' is-dim' : ''}">
      <span class="trow__ring">
        ${circleSvg({ size: 40, level: t.level, fill: t.fill, color: t.color,
                      emblem: t.emblem, content: t.content })}
      </span>
      <span class="trow__main">
        <b>${t.name}</b>
        <span>${t.group ? `${t.group} · ` : ''}${t.sum}</span>
        ${t.fill > 0 && !dim ? `<span class="trow__bar">
          <i style="width:${Math.min(100, Math.round(t.fill * 100))}%;background:${t.color}"></i>
        </span>` : ''}
      </span>
      ${t.quick ? `<button class="trow__quick" type="button">${t.quick}</button>` : ''}
      <button class="trow__more" type="button" aria-label="Ещё">⋯</button>
    </li>`;
}

function goal(g) {
  const pct = Math.round((g.day / g.days) * 100);
  const left = g.budget - g.used;
  const low = left <= 1;

  return `
    <li class="goal">
      <div class="goal__head">
        <b>${g.name}</b>
        <span>${g.theme}</span>
      </div>
      <div class="goal__bar"><i style="width:${pct}%;background:${g.color}"></i></div>
      <div class="goal__foot">
        <span>День ${g.day} из ${g.days}</span>
        <span class="${low ? 'is-low' : ''}">Пропусков в запасе: ${left} из ${g.budget}</span>
      </div>
      ${low ? `<p class="goal__hint">Запас на исходе. Пропуск можно закрыть кредитом
        доверия - задним числом и не старше трёх дней.</p>` : ''}
    </li>`;
}

export function createToday(mount) {
  const date = new Date().toLocaleDateString('ru-RU',
    { weekday: 'long', day: 'numeric', month: 'long' });

  mount.innerHTML = `
    <header class="topbar">
      <span class="topbar__date">${date}</span>
      <button class="topbar__menu" type="button" aria-label="Меню">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" stroke="var(--c-ink)"
            stroke-width="2" stroke-linecap="round" fill="none"/>
        </svg>
      </button>
    </header>

    <div class="today">
      <h2 class="today__title">Ждут <span class="count">${themes.length}</span></h2>
      <ul class="tlist">${themes.map((t) => row(t)).join('')}</ul>

      <h2 class="today__title">Сделано <span class="count">${done.length}</span></h2>
      <ul class="tlist">${done.map((t) => row(t, true)).join('')}</ul>

      <h2 class="today__title">Цели
        <span class="credit" title="Кредит доверия">
          <svg viewBox="0 0 100 100" width="14" height="14" aria-hidden="true">
            <path d="M50 6 L86 19 V50 C86 72 70 85 50 94 C30 85 14 72 14 50 V19 Z"
              fill="currentColor"/></svg>
          ${CREDIT}
        </span>
      </h2>
      <ul class="tlist tlist--goals">${goals.map(goal).join('')}</ul>

      <p class="today__note">Не успеваешь - скажи об этом заранее. Объявленный
        пропуск тратит запас, но срывом не считается.</p>
      <button class="btn" type="button">Сегодня пропускаю</button>
    </div>

    <nav class="tabbar">
      <ul class="tabbar__row">
        <li class="tab">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5V21H3z" fill="none" stroke="var(--c-line)"
              stroke-width="1.8" stroke-linejoin="round"/></svg>
        </li>
        <li class="tab is-on">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M4 6h10M4 12h16M4 18h7" stroke="var(--c-ink)" stroke-width="2"
              stroke-linecap="round" fill="none"/>
            <path d="M17 6.5l1.6 1.6L22 4.7" stroke="var(--c-ink)" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </li>
        ${['', '', ''].map(() => `<li class="tab">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="4" fill="none"
              stroke="var(--c-line)" stroke-width="1.8"/></svg>
        </li>`).join('')}
      </ul>
    </nav>`;
}
