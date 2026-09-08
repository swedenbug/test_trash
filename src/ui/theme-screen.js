/*
  theme-screen.js - развёрнутый экран темы.
  Назначение: значение дня, график, полная история записей и ввод.
  Зависимости: engine (движок), undo, card.js (блок графика).

  Один экран на все виды тем. Вид меняет только способ ввода: у счётчика
  и времени это величина, у флажка отметка, у оценки балл, у заметки текст.
  Всё остальное - заголовок, сводка, график, история - общее.

  Открывается удержанием кружка три секунды.
*/

import { chartBlock } from './card.js';

/* Слова о дне. Тон ровный: это сообщение о факте, а не оценка человека. */
const DAY_STATE = {
  broken: 'норма превышена',
  done:   'норма выполнена',
};

export function createThemeScreen({ engine, undo, onChange, onEdit }) {
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.hidden = true;
  el.innerHTML = `
    <div class="sheet-back"></div>
    <section class="sheet-panel">
      <header class="sheet-panel__head">
        <h2 id="t-title">Тема</h2>
        <button class="btn" id="t-edit" type="button">Изменить</button>
        <button class="sheet-panel__close" type="button" aria-label="Закрыть">✕</button>
      </header>

      <p class="sheet-panel__desc" id="t-desc" hidden></p>
      <p class="sheet-panel__sum" id="t-sum">-</p>
      <p class="sheet-panel__state" id="t-state" hidden></p>

      <div class="card__chart" id="t-chart"></div>

      <div class="manual" id="t-input"></div>
      <p class="manual__err" id="t-err" hidden></p>

      <h3 class="sheet-panel__sub">История</h3>
      <ul class="records" id="t-list"></ul>
    </section>`;

  const $ = (s) => el.querySelector(s);
  const close = () => { el.hidden = true; };

  let themeId = null;

  function say(text) {
    const err = $('#t-err');
    err.textContent = text ?? '';
    err.hidden = !text;
  }

  /* --- ввод по видам ------------------------------------------------ */

  function inputHtml(theme) {
    const quick = Array.isArray(theme.quick) ? theme.quick : [];
    const buttons = quick
      .map((v) => `<button class="btn" data-quick="${v}" type="button">+${v}</button>`)
      .join('');

    switch (theme.kind) {
      case 'flag':
        return '<button class="btn" id="t-flag" type="button">Отметить</button>';

      case 'scale':
        return `<select class="manual__input" id="t-scale">${
          Array.from({ length: 10 }, (_, i) =>
            `<option value="${i + 1}">${i + 1}</option>`).join('')
        }</select><button class="btn" id="t-add" type="button">Записать</button>`;

      case 'note':
        return `<input class="manual__input" id="t-note" type="text"
                       placeholder="Что записать" autocomplete="off">
                <button class="btn" id="t-add" type="button">Записать</button>`;

      default:
        return `${buttons}
                <input class="manual__input" id="t-value" type="number" inputmode="numeric"
                       min="1" step="1" placeholder="${theme.unit ?? 'значение'}">
                <button class="btn" id="t-add" type="button">Записать</button>`;
    }
  }

  async function write(value, source, note) {
    try {
      const { record, removed } = await engine.add(themeId, value, source, note);
      const label = await engine.labelFor(themeId, record);
      undo.push({
        label: removed ? `снято: ${label}` : label,
        onUndo: () => (removed ? engine.restore(record.id) : engine.remove(record.id)),
      });
      say('');
      await refresh();
      onChange?.();
    } catch (e) {
      say(`Запись не сохранена: ${e.message}`);
    }
  }

  function bindInput(theme) {
    for (const b of el.querySelectorAll('[data-quick]')) {
      b.addEventListener('click', () => write(Number(b.dataset.quick), 'manual'));
    }

    $('#t-flag')?.addEventListener('click', () => write(1, 'manual'));

    $('#t-add')?.addEventListener('click', () => {
      if (theme.kind === 'scale') return write(Number($('#t-scale').value), 'manual');

      if (theme.kind === 'note') {
        const text = $('#t-note').value.trim();
        if (!text) return say('Заметка пустая');
        $('#t-note').value = '';
        // У заметки величины нет: значение ноль, смысл в тексте.
        return write(0, 'manual', text);
      }

      const v = Number($('#t-value').value);
      if (!Number.isFinite(v) || v <= 0) return say('Значение должно быть больше нуля');
      $('#t-value').value = '';
      return write(v, 'manual');
    });
  }

  /* --- отрисовка ---------------------------------------------------- */

  async function refresh() {
    if (!themeId) return;

    const theme = await engine.get(themeId);
    if (!theme) { close(); return; }

    const { goal, state } = await engine.progress(themeId);
    const urgency = await engine.getUrgency(themeId);

    $('#t-title').textContent = theme.name;
    $('#t-desc').textContent = theme.description ?? '';
    $('#t-desc').hidden = !theme.description;
    // Сводку считает движок: у шкалы потолок задан видом, а не нормой.
    $('#t-sum').textContent = urgency.summary;

    /*
      Состояние дня словами - здесь, а не на кружке: кружок отвечает «сколько
      и насколько срочно», а «нарушено» - суждение о дне. У темы «не более»
      до конца суток день не объявляется успешным: успех задним числом
      обесценивает сам себя.
    */
    let words = DAY_STATE[state] ?? '';
    if (!words && theme.direction === 'at_most' && goal !== null) words = 'пока в порядке';
    $('#t-state').textContent = words;
    $('#t-state').hidden = !words;
    $('#t-state').dataset.state = state;

    /*
      Накопление за день имеет смысл только у величины, а недельные виды -
      только при настоящей норме. Пустой график вдобавок опасен: без нормы
      и без значений верх графика равен нулю, и все координаты выходят NaN.
    */
    const series = await engine.series(themeId);
    const views = !['count', 'time'].includes(theme.kind) ? []
      : goal !== null ? ['day-line', 'week-line', 'week-bars']
      : (series.cumulative.some((p) => p.ml > 0) ? ['day-line'] : []);

    $('#t-chart').innerHTML = chartBlock({ views, page: 0, series, goal: goal ?? 0 });
    $('#t-chart').hidden = views.length === 0;

    const box = $('#t-input');
    box.innerHTML = inputHtml(theme);
    bindInput(theme);

    /* История полная, а не за сутки: лента на главном - окно двадцати четырёх
       часов, а здесь у темы спрашивают, как шло дело вообще. */
    const rows = (await engine.getRecent()).filter((r) => r.moduleId === themeId);
    const list = $('#t-list');
    list.innerHTML = '';

    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'records__empty';
      li.textContent = 'Записей пока нет';
      list.append(li);
      return;
    }

    for (const r of rows) {
      const li = document.createElement('li');
      li.className = 'records__row';

      const when = document.createElement('span');
      when.className = 'records__time';
      when.textContent = new Date(r.at).toLocaleString('ru-RU',
        { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

      const what = document.createElement('span');
      what.className = 'records__ml';
      what.textContent = `${r.title} · ${r.detail}`;

      const kill = document.createElement('button');
      kill.className = 'records__del';
      kill.type = 'button';
      kill.setAttribute('aria-label', 'Удалить запись');
      kill.textContent = '✕';
      kill.addEventListener('click', async () => {
        await engine.removeRecord(r.id);
        undo.push({ label: `удалено: ${r.title}`, onUndo: () => engine.restoreRecord(r.id) });
        await refresh();
        onChange?.();
      });

      li.append(when, what, kill);
      list.append(li);
    }
  }

  $('#t-edit').addEventListener('click', () => {
    close();
    onEdit?.(themeId);
  });

  $('.sheet-panel__close').addEventListener('click', close);
  $('.sheet-back').addEventListener('click', close);

  return {
    el,
    async open(id) { themeId = id; say(''); await refresh(); el.hidden = false; },
    close,
    refresh,
  };
}
