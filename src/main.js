/*
  main.js — временная точка входа.
  Назначение: проверить, что контур доставки работает — ES-модули грузятся,
  хранилище доступно, приложение открыто с главного экрана.
  Заменяется на реальную оболочку (shell) на волне 1.
  Зависимости: нет.
*/

const VERSION = '0.0.1';

const checks = [
  {
    label: 'ES-модули',
    run: () => ({ state: 'ok', value: 'загружены' }),
  },
  {
    label: 'Протокол',
    run: () => {
      const p = location.protocol;
      if (p === 'https:') return { state: 'ok', value: 'https' };
      if (p === 'http:') return { state: 'ok', value: 'http (локально)' };
      return { state: 'fail', value: p };
    },
  },
  {
    label: 'Локальное хранилище',
    run: () => {
      try {
        const key = '__probe__';
        localStorage.setItem(key, '1');
        const back = localStorage.getItem(key);
        localStorage.removeItem(key);
        return back === '1'
          ? { state: 'ok', value: 'доступно' }
          : { state: 'fail', value: 'не читается' };
      } catch (e) {
        return { state: 'fail', value: 'заблокировано' };
      }
    },
  },
  {
    label: 'Режим запуска',
    run: () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
      return standalone
        ? { state: 'ok', value: 'с главного экрана' }
        : { state: 'warn', value: 'вкладка браузера' };
    },
  },
  {
    label: 'Сеть',
    run: () => (navigator.onLine
      ? { state: 'ok', value: 'онлайн' }
      : { state: 'warn', value: 'офлайн' }),
  },
];

function render() {
  const list = document.getElementById('checks');
  list.innerHTML = '';

  for (const check of checks) {
    let result;
    try {
      result = check.run();
    } catch (e) {
      result = { state: 'fail', value: 'ошибка' };
    }

    const li = document.createElement('li');

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.dataset.state = result.state;

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = check.label;

    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = result.value;

    li.append(dot, label, value);
    list.append(li);
  }

  document.getElementById('version').textContent =
    `версия ${VERSION} · ${new Date().toLocaleDateString('ru-RU')}`;
}

render();
window.addEventListener('online', render);
window.addEventListener('offline', render);
