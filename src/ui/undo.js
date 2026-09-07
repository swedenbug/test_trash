/*
  undo.js - таблетка отмены и стопка действий.
  Назначение: показать предложение отменить последнее действие и отсчитать
  семь секунд. Модуль сообщает о совершённом действии и больше ни о чём не
  заботится: таймер, кольцо, стопка и исчезновение - не его дело.
  Зависимости: нет.

  Правила стопки:
    действие кладётся на вершину, отсчёт идёт для вершины;
    отмена снимает вершину и показывает следующую с новым отсчётом;
    отсчёт истёк - закрывается вся стопка целиком.
  Стопка живёт только в памяти: перезапуск приложения её обнуляет.
*/

const SECONDS = 7;

export function createUndo(mount) {
  const stack = [];
  let raf = null;
  let startedAt = 0;

  const el = document.createElement('div');
  el.className = 'undo';
  el.hidden = true;
  el.innerHTML = `
    <button class="undo__btn" type="button">
      <span class="undo__label"></span>
      <svg class="undo__ring" viewBox="0 0 36 36" width="20" height="20" aria-hidden="true">
        <circle cx="18" cy="18" r="15" fill="none" stroke="var(--c-line)" stroke-width="3"/>
        <circle class="undo__arc" cx="18" cy="18" r="15" fill="none"
          stroke="var(--c-ink)" stroke-width="3" stroke-linecap="round"
          pathLength="100" stroke-dasharray="100 100"
          transform="rotate(-90 18 18)"/>
      </svg>
    </button>`;
  mount.append(el);

  const label = el.querySelector('.undo__label');
  const arc = el.querySelector('.undo__arc');

  function tick() {
    const left = 1 - (performance.now() - startedAt) / (SECONDS * 1000);
    if (left <= 0) return closeAll();
    arc.setAttribute('stroke-dasharray', `${(left * 100).toFixed(1)} 100`);
    raf = requestAnimationFrame(tick);
  }

  function show() {
    const top = stack[stack.length - 1];
    if (!top) return closeAll();

    label.textContent = `Отменить ${trim(top.label)}`;
    el.hidden = false;
    startedAt = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function closeAll() {
    cancelAnimationFrame(raf);
    raf = null;
    stack.length = 0;
    el.hidden = true;
  }

  el.querySelector('.undo__btn').addEventListener('click', async () => {
    const top = stack.pop();
    if (!top) return closeAll();
    try {
      await top.onUndo();
    } catch (e) {
      console.error('отмена не удалась:', e);
    }
    stack.length ? show() : closeAll();
  });

  return {
    /** @param {{label: string, onUndo: () => Promise<void>|void}} action */
    push(action) {
      stack.push(action);
      show();
    },
    close: closeAll,
  };
}

/* Подпись ограничена намеренно: за семь секунд длинную строку не прочитать. */
function trim(text, max = 24) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > 8 ? cut.slice(0, space) : cut) + '…';
}
