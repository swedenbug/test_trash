/*
  theme-order.js - порядок тем.
  Назначение: переставить темы, не вводя номера руками.
  Зависимости: engine (движок).

  `sort` руками не вводится: число, которое пользователь придумывает сам,
  однажды окажется одинаковым у двух тем, и порядок станет случайным.
  Здесь список задаёт порядок целиком, а движок раскладывает номера.

  Переставляют стрелками, а не перетаскиванием. Перетаскивание на телефоне
  спорит с прокруткой: палец, поехавший вниз, может оказаться и жестом
  переноса, и прокруткой страницы, и разбирать это приходится по десяткам
  пикселей. Стрелки работают всегда и на обоих устройствах.
*/

export function createThemeOrder({ engine, onChange }) {
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.hidden = true;
  el.innerHTML = `
    <div class="sheet-back"></div>
    <section class="sheet-panel">
      <header class="sheet-panel__head">
        <h2>Порядок тем</h2>
        <button class="sheet-panel__close" type="button" aria-label="Закрыть">✕</button>
      </header>

      <p class="field__hint">Порядок карточек в ленте. Кружки наверху идут
        по срочности и этому списку не подчиняются.</p>

      <ul class="order" id="o-list"></ul>
    </section>`;

  const $ = (s) => el.querySelector(s);
  const close = () => { el.hidden = true; };

  let ids = [];

  function arrow(dir, disabled) {
    const d = dir === 'up' ? 'M6 14 L12 8 L18 14' : 'M6 10 L12 16 L18 10';
    return `<button class="order__move" type="button" data-dir="${dir}"
        aria-label="${dir === 'up' ? 'Выше' : 'Ниже'}" ${disabled ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="${d}" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>`;
  }

  async function refresh() {
    const themes = await engine.all();
    ids = themes.map((t) => t.id);

    const list = $('#o-list');
    list.innerHTML = '';

    if (!themes.length) {
      const li = document.createElement('li');
      li.className = 'records__empty';
      li.textContent = 'Тем пока нет';
      list.append(li);
      return;
    }

    themes.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'order__row';
      li.innerHTML = `
        <span class="order__num">${i + 1}</span>
        <span class="order__name">${t.short ?? t.name}${t.active ? '' : ' · выключена'}</span>
        <span class="order__grip">
          ${arrow('up', i === 0)}
          ${arrow('down', i === themes.length - 1)}
        </span>`;

      for (const b of li.querySelectorAll('[data-dir]')) {
        b.addEventListener('click', async () => {
          const to = b.dataset.dir === 'up' ? i - 1 : i + 1;
          if (to < 0 || to >= ids.length) return;
          [ids[i], ids[to]] = [ids[to], ids[i]];
          await engine.reorder(ids);
          await refresh();
          onChange?.();
        });
      }

      list.append(li);
    });
  }

  $('.sheet-panel__close').addEventListener('click', close);
  $('.sheet-back').addEventListener('click', close);

  return {
    el,
    async open() { await refresh(); el.hidden = false; },
    close,
    refresh,
  };
}
