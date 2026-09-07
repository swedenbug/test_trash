/*
  states-water.js - витрина состояний кружка воды.
  Назначение: показать каждое состояние отдельно, в натуральную величину,
  для согласования до сборки экрана.
  Зависимости: circle.js.
  В приложение не входит.
*/

import { circleSvg } from './circle.js';

let size = 72;

const groups = [
  {
    title: 'Прогресс дня',
    hint: 'Кольцо серое: пил недавно, внимания не требует. Меняется только заливка капли.',
    items: [
      { name: 'Первый запуск',  hint: 'записей нет',        opts: { level: 'done', fill: 0 } },
      { name: 'Четверть нормы', hint: '600 из 2500 мл',     opts: { level: 'done', fill: 0.25 } },
      { name: 'Половина',       hint: '1250 из 2500 мл',    opts: { level: 'done', fill: 0.5 } },
      { name: 'Почти норма',    hint: '2250 из 2500 мл',    opts: { level: 'done', fill: 0.9 } },
      { name: 'Норма закрыта',  hint: 'ровно 2500 мл',      opts: { level: 'done', fill: 1 } },
      { name: 'Перевыполнено',  hint: 'капля светится',     opts: { level: 'done', fill: 1.3 } },
    ],
  },
  {
    title: 'Срочность',
    hint: 'Заливка одна и та же - 40 % нормы. Меняется только кольцо.',
    items: [
      { name: 'Пил недавно', hint: 'до 72 минут',      opts: { level: 'done', fill: 0.4 } },
      { name: 'Пора пить',   hint: 'от 72 минут',      opts: { level: 'soft', fill: 0.4 } },
      { name: 'Затянулось',  hint: 'больше 3 часов',   opts: { level: 'hard', fill: 0.4 } },
      { name: 'Норма и долгий перерыв', hint: 'потолок - мягкий уровень', opts: { level: 'soft', fill: 1 } },
    ],
  },
  {
    title: 'После действия',
    hint: 'Процент проступает на 7 секунд, ровно пока доступна отмена.',
    items: [
      { name: 'Записан стакан', hint: '+250 мл',  opts: { level: 'done', fill: 0.42, percent: 42 } },
      { name: 'Записан литр',   hint: '+1000 мл', opts: { level: 'done', fill: 0.82, percent: 82 } },
      { name: 'Сверх нормы',    hint: 'процент выше ста', opts: { level: 'done', fill: 1.3, percent: 130 } },
    ],
  },
  {
    title: 'Удержание',
    hint: 'Первый круг набирает литр. Второй его отменяет и открывает экран - литр гаснет на глазах.',
    items: [
      { name: 'Полсекунды',   hint: 'литр набирается',      opts: { level: 'done', fill: 0.4, hold: { lap: 1, progress: 0.5 } } },
      { name: 'Секунда',      hint: 'литр набран',          opts: { level: 'done', fill: 0.4, hold: { lap: 1, progress: 1 } } },
      { name: 'Две секунды',  hint: 'литр наполовину утёк', opts: { level: 'done', fill: 0.4, hold: { lap: 2, progress: 0.5 } } },
      { name: 'Три секунды',  hint: 'литр отменён, открывается экран', opts: { level: 'done', fill: 0.4, hold: { lap: 2, progress: 1 } } },
    ],
  },
  {
    title: 'Служебные',
    hint: 'Состояния, без которых на экране окажется пустота.',
    items: [
      { name: 'Загрузка',        hint: 'данные читаются',      opts: { state: 'loading' } },
      { name: 'Отказ хранилища', hint: 'запись не засчитана',  opts: { state: 'error' } },
    ],
  },
];

function render() {
  const root = document.getElementById('root');
  root.innerHTML = '';

  for (const group of groups) {
    const h = document.createElement('h2');
    h.className = 'section';
    h.textContent = group.title;
    root.append(h);

    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = group.hint;
    root.append(note);

    const ul = document.createElement('ul');
    ul.className = 'grid';

    for (const item of group.items) {
      const li = document.createElement('li');
      li.className = 'cell';

      const art = document.createElement('div');
      art.className = 'art';
      art.innerHTML = circleSvg({ size, ...item.opts });

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = item.name;

      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = item.hint;

      li.append(art, name, hint);
      ul.append(li);
    }

    root.append(ul);
  }
}

document.getElementById('bigger').addEventListener('click', () => {
  size = size === 72 ? 144 : 72;
  document.getElementById('bigger').textContent = size === 72 ? 'Крупнее' : 'В натуральную величину';
  render();
});

render();
