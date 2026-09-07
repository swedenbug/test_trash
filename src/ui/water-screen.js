/*
  water-screen.js - развёрнутый экран темы «Водный баланс».
  Назначение: ручной ввод и записи за сегодня. Открывается удержанием кружка.
  Зависимости: water (тема), undo.
*/

export function createWaterScreen({ water, undo, onChange }) {
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.hidden = true;
  el.innerHTML = `
    <div class="sheet-back"></div>
    <section class="sheet-panel">
      <header class="sheet-panel__head">
        <h2>Водный баланс</h2>
        <button class="sheet-panel__close" type="button" aria-label="Закрыть">✕</button>
      </header>

      <p class="sheet-panel__sum" id="w-sum">-</p>

      <div class="manual">
        <input class="manual__input" id="w-ml" type="number" inputmode="numeric"
               min="1" max="5000" step="50" placeholder="Объём, мл">
        <button class="btn" id="w-add" type="button">Записать</button>
      </div>
      <p class="manual__err" id="w-err" hidden></p>

      <h3 class="sheet-panel__sub">Сегодня</h3>
      <ul class="records" id="w-list"></ul>
    </section>`;

  const $ = (id) => el.querySelector(id);

  async function refresh() {
    const { value, goal } = await water.progress();
    $('#w-sum').textContent = `${value} из ${goal} мл`;

    const rows = await water.intakesOn(await water.today());
    const list = $('#w-list');
    list.innerHTML = '';

    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'records__empty';
      li.textContent = 'Сегодня записей ещё нет';
      list.append(li);
      return;
    }

    for (const r of rows) {
      const li = document.createElement('li');
      li.className = 'records__row';

      const time = document.createElement('span');
      time.className = 'records__time';
      time.textContent = new Date(r.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

      const ml = document.createElement('span');
      ml.className = 'records__ml';
      ml.textContent = `${r.amount_ml} мл`;

      const del = document.createElement('button');
      del.className = 'records__del';
      del.type = 'button';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Удалить запись');
      del.addEventListener('click', async () => {
        await water.remove(r.id);
        undo.push({ label: `удаление ${r.amount_ml} мл`, onUndo: () => water.restore(r.id) });
        await refresh();
        onChange?.();
      });

      li.append(time, ml, del);
      list.append(li);
    }
  }

  $('#w-add').addEventListener('click', async () => {
    const field = $('#w-ml');
    const err = $('#w-err');
    const ml = Number(field.value);

    if (!Number.isFinite(ml) || ml <= 0 || ml > 5000) {
      err.textContent = 'Объём должен быть от 1 до 5000 мл';
      err.hidden = false;
      return;
    }

    err.hidden = true;
    const rec = await water.add(ml, 'manual');
    field.value = '';
    undo.push({ label: `${rec.amount_ml} мл`, onUndo: () => water.remove(rec.id) });
    await refresh();
    onChange?.();
  });

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
