/*
  recent.js — лента недавних записей.
  Назначение: показать всё, что записано за сутки, по всем темам сразу,
  и дать это исправить.
  Зависимости: темы (по контракту ленты), undo.

  Оболочка не знает, что такое вода или подход. Она опрашивает темы,
  склеивает ответы и сортирует по времени. Новая тема попадает сюда
  без единой правки этого файла.
*/

const WINDOW_HOURS = 24;

export function createRecent({ themes, undo, onChange }) {
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.hidden = true;
  el.innerHTML = `
    <div class="sheet-back"></div>
    <section class="sheet-panel">
      <header class="sheet-panel__head">
        <h2>Недавние записи</h2>
        <button class="sheet-panel__close" type="button" aria-label="Закрыть">✕</button>
      </header>
      <p class="sheet-panel__hint">За последние сутки. Полная история — на экране темы</p>

      <div class="chips" id="r-chips"></div>
      <ul class="records" id="r-list"></ul>
    </section>`;

  const $ = (s) => el.querySelector(s);
  let filter = 'all';

  function since() {
    return new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
  }

  function when(iso) {
    const d = new Date(iso);
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? time : `вчера ${time}`;
  }

  function chips() {
    const box = $('#r-chips');
    box.innerHTML = '';

    const options = [{ id: 'all', short: 'Все' }, ...themes];
    for (const o of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `chip${filter === o.id ? ' is-on' : ''}`;
      b.textContent = o.short;
      b.addEventListener('click', () => { filter = o.id; refresh(); });
      box.append(b);
    }
  }

  async function collect() {
    const from = since();
    const wanted = filter === 'all' ? themes : themes.filter((t) => t.id === filter);

    const lists = await Promise.all(wanted.map(async (t) => {
      try {
        return await t.getRecent(from);
      } catch (e) {
        console.error(`тема ${t.id} не отдала записи:`, e);
        return [];
      }
    }));

    return lists.flat().sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  async function refresh() {
    chips();
    const rows = await collect();
    const list = $('#r-list');
    list.innerHTML = '';

    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'records__empty';
      li.textContent = filter === 'all'
        ? 'За сутки записей нет'
        : 'По этой теме за сутки записей нет';
      list.append(li);
      return;
    }

    for (const r of rows) {
      const theme = themes.find((t) => t.id === r.moduleId);

      const li = document.createElement('li');
      li.className = 'records__row';

      const dot = document.createElement('span');
      dot.className = 'records__dot';
      dot.style.background = theme?.color ?? 'var(--c-faint)';

      const time = document.createElement('span');
      time.className = 'records__time';
      time.textContent = when(r.at);

      const main = document.createElement('span');
      main.className = 'records__main';
      main.innerHTML = `<b>${r.title}</b>${r.detail ? `<span>${r.detail}</span>` : ''}`;

      const del = document.createElement('button');
      del.className = 'records__del';
      del.type = 'button';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Удалить запись');
      del.addEventListener('click', async () => {
        await theme.removeRecord(r.id);
        undo.push({
          label: `удаление ${r.title}`,
          onUndo: () => theme.restoreRecord(r.id),
        });
        await refresh();
        onChange?.();
      });

      li.append(dot, time, main, del);
      list.append(li);
    }
  }

  const close = () => { el.hidden = true; };
  $('.sheet-panel__close').addEventListener('click', close);
  $('.sheet-back').addEventListener('click', close);

  return {
    el,
    async open() { await refresh(); el.hidden = false; },
    close,
    refresh,
  };
}
