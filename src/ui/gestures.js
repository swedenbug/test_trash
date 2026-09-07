/*
  gestures.js - тап и удержание с растущим кольцом.
  Назначение: разложить одно касание на три исхода и всё время показывать,
  что произойдёт при отпускании.
  Зависимости: нет.

  Тап                       - короткое действие.
  Отпустил после первого порога - среднее действие.
  Дотянул до второго порога   - переход. Среднее действие при этом отменяется.
*/

const MOVE_LIMIT = 10;    // сдвиг больше этого считается прокруткой, а не вводом

export function attachHold(el, {
  first = 1000,
  second = 3000,
  onTap,
  onFirst,
  onSecond,
  onProgress,
} = {}) {
  let startX = 0, startY = 0, startedAt = 0;
  let raf = null, pressed = false, done = false;

  function frame() {
    const ms = performance.now() - startedAt;

    if (ms >= second) {
      finish();
      done = true;
      onSecond?.();
      return;
    }

    onProgress?.(ms < first
      ? { lap: 1, progress: ms / first }
      : { lap: 2, progress: (ms - first) / (second - first) });

    raf = requestAnimationFrame(frame);
  }

  function finish() {
    pressed = false;
    cancelAnimationFrame(raf);
    raf = null;
    onProgress?.(null);
  }

  function down(e) {
    pressed = true;
    done = false;
    startX = e.clientX; startY = e.clientY;
    startedAt = performance.now();
    el.setPointerCapture?.(e.pointerId);
    raf = requestAnimationFrame(frame);
  }

  function move(e) {
    if (!pressed) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_LIMIT) {
      finish();          // палец поехал - это прокрутка, ввода не было
    }
  }

  function up() {
    if (!pressed || done) { finish(); return; }
    const ms = performance.now() - startedAt;
    finish();
    if (ms < first) onTap?.();
    else onFirst?.();
  }

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', finish);

  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', finish);
    finish();
  };
}

/*
  Горизонтальное листание. Вертикальная прокрутка остаётся за страницей:
  жест считается нашим, только если палец поехал вбок заметно сильнее, чем вниз.
*/
const SWIPE_MIN = 40;     // короче этого - случайное дрожание
const EDGE = 20;          // у самого края Safari перехватывает жест «назад»

export function attachSwipe(el, { onLeft, onRight } = {}) {
  let x0 = 0, y0 = 0, live = false;

  el.addEventListener('pointerdown', (e) => {
    if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
    live = true;
    x0 = e.clientX;
    y0 = e.clientY;
  });

  el.addEventListener('pointerup', (e) => {
    if (!live) return;
    live = false;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return;
    (dx < 0 ? onLeft : onRight)?.();
  });

  el.addEventListener('pointercancel', () => { live = false; });
}
