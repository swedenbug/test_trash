/*
  menu.js - панель меню.
  Назначение: разделы, не помещающиеся на главный экран. Пока один - «Данные».
  Зависимости: store, backup.

  Раздел данных отвечает на четыре вопроса: сколько занято, переживут ли
  данные чистку браузера, как забрать копию и как вернуть её обратно.
*/

import { exportToFile, importFromFile } from '../core/backup.js';
import { VERSION } from '../version.js';

/* Служебные имена сервера человеку не показываем. */
const COLLECTION = {
  settings:     'Настройки',
  theme:        'Тема',
  theme_goal:   'Норма темы',
  entry:        'Запись',
};

const REASON = {
  unknown_field: 'поле, которого сервер не знает',
  missing_field: 'не хватает обязательного поля',
  constraint:    'значение не прошло проверку',
  bad_json:      'повреждённое значение',
};

export function createMenu({ store, sync, onChange, onOpenRecent }) {
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.hidden = true;
  el.innerHTML = `
    <div class="sheet-back"></div>
    <section class="sheet-panel">
      <header class="sheet-panel__head">
        <h2>Меню</h2>
        <button class="sheet-panel__close" type="button" aria-label="Закрыть">✕</button>
      </header>

      <ul class="menu-list">
        <li><button class="menu-link" id="m-recent" type="button">
          <span>Недавние записи</span><span class="menu-link__go">›</span>
        </button></li>
      </ul>

      <h3 class="sheet-panel__sub">Сервер</h3>
      <ul class="facts" id="s-facts"></ul>
      <div class="field">
        <label class="field__label" for="s-url">Адрес обмена</label>
        <input class="manual__input" id="s-url" type="url" inputmode="url"
               placeholder="https://progress.example.com" autocomplete="off">
        <label class="field__label" for="s-token" style="margin-top:.5rem">Пропуск</label>
        <input class="manual__input" id="s-token" type="password"
               placeholder="строка из настроек сервера" autocomplete="off">
        <div class="m-actions">
          <button class="btn" id="s-save" type="button">Сохранить</button>
          <button class="btn" id="s-check" type="button">Проверить связь</button>
          <button class="btn" id="s-run" type="button">Синхронизировать</button>
        </div>
        <p class="field__hint">Пропуск хранится только на этом устройстве и на сервер
          не уезжает. Обмен идёт сам при запуске и раз в несколько минут.</p>
        <p class="m-note" id="s-note" hidden></p>
      </div>

      <h3 class="sheet-panel__sub">Данные</h3>
      <ul class="facts" id="m-facts"></ul>

      <p class="m-note" id="m-note" hidden></p>

      <div class="m-actions">
        <button class="btn" id="m-export" type="button">Сделать копию</button>
        <button class="btn" id="m-import" type="button">Загрузить копию</button>
      </div>

      <input id="m-file" type="file" accept="application/json,.json" hidden>

      <div class="m-import-mode" id="m-mode" hidden>
        <p class="m-note">Как поступить с файлом?</p>
        <div class="m-actions">
          <button class="btn" id="m-merge" type="button">Дополнить</button>
          <button class="btn" id="m-replace" type="button">Заменить всё</button>
          <button class="btn" id="m-cancel" type="button">Отмена</button>
        </div>
      </div>

      <h3 class="sheet-panel__sub">Опасная зона</h3>
      <div class="m-actions">
        <button class="btn btn--danger" id="m-wipe" type="button">Стереть все данные</button>
      </div>
    </section>`;

  const $ = (s) => el.querySelector(s);
  const close = () => { el.hidden = true; };
  let pendingFile = null;
  let wipeArmed = false;

  function say(text, kind = '') {
    const note = $('#m-note');
    note.textContent = text;
    note.className = `m-note ${kind}`;
    note.hidden = !text;
  }

  function fact(label, value, hint) {
    const li = document.createElement('li');
    li.className = 'facts__row';
    li.innerHTML = `<span class="facts__label">${label}</span>
                    <span class="facts__value">${value}</span>`;
    if (hint) {
      const p = document.createElement('p');
      p.className = 'facts__hint';
      p.textContent = hint;
      li.append(p);
    }
    return li;
  }

  async function refreshSync() {
    const st = await sync.state();
    $('#s-url').value = st.url ?? '';

    const list = $('#s-facts');
    list.innerHTML = '';

    /*
      Версия сборки - первой строкой. Кэш Pages живёт десять минут, и без этой
      строки нельзя отличить «правка не работает» от «правка ещё не доехала».
      Один раз это уже стоило захода: проверяли версию, которой не было.
    */
    list.append(fact('Версия', VERSION.stamp,
      `Собрано ${new Date(VERSION.built).toLocaleString('ru-RU')}`));

    list.append(fact('Настроен', st.configured ? 'да' : 'нет',
      st.configured ? '' : 'Пока адрес и пропуск не заданы, данные живут только здесь.'));
    list.append(fact('Последний обмен', st.lastSync
      ? new Date(st.lastSync).toLocaleString('ru-RU')
      : 'не было'));
    list.append(fact('Ждёт отправки', String(st.pending)));

    /*
      Ноль - строки нет: пустая строка «Не принято: 0» была бы упрёком ни о чём.
      Обмен молчит про сеть, но не про потерянную запись: молчание про сеть -
      решение, а про отказ сервера - потеря.
    */
    if (st.rejected > 0) {
      const row = fact('Не принято сервером', String(st.rejected),
        'Нажмите, чтобы посмотреть. Эти записи не отправляются заново, пока их не поправят.');
      row.classList.add('facts__row--tap');
      row.addEventListener('click', async () => {
        const open = row.querySelector('.facts__detail');
        if (open) { open.remove(); return; }

        const items = await sync.rejectedList();
        const ul = document.createElement('ul');
        ul.className = 'facts__detail';
        for (const r of items) {
          const li = document.createElement('li');
          li.textContent = `${COLLECTION[r.table] ?? r.table ?? 'запись'}`
            + ` · ${new Date(r.at).toLocaleString('ru-RU')}`
            + ` · ${REASON[r.reason] ?? r.reason}`;
          ul.append(li);
        }

        /*
          Запись выходит из списка сама, только если её поправили. Когда причину
          устранили на сервере, править на устройстве нечего - и без этой кнопки
          запись осталась бы в списке навсегда.
        */
        const again = document.createElement('button');
        again.className = 'btn';
        again.type = 'button';
        again.textContent = 'Отправить заново';
        again.addEventListener('click', async (e) => {
          e.stopPropagation();
          again.disabled = true;
          await sync.retryRejected();
          try {
            await sync.run();
            syncSay('Отправлено заново. Если причина не устранена, записи вернутся в список.', 'is-ok');
          } catch (err) {
            syncSay(`Обмен не удался: ${err.message}`, 'is-bad');
          }
          await refreshSync();
        });

        const foot = document.createElement('li');
        foot.append(again);
        ul.append(foot);
        row.append(ul);
      });
      list.append(row);
    }
  }

  async function refresh() {
    await refreshSync();

    const list = $('#m-facts');
    list.innerHTML = '';

    const meta = await store.meta();
    const quota = await store.quota();
    const persisted = await store.isPersisted();
    const themes  = await store.count('theme');
    const records = await store.count('entry');

    list.append(fact('Тем', String(themes)));
    list.append(fact('Записей', String(records)));
    list.append(fact('Версия схемы', meta ? String(meta.schema_version) : '-'));

    if (quota) {
      const mb = (n) => `${(n / 1048576).toFixed(1)} МБ`;
      list.append(fact('Занято', `${mb(quota.usage)} из ${mb(quota.quota)}`));
    }

    list.append(fact(
      'Постоянное хранение',
      persisted === null ? 'браузер не сообщает' : persisted ? 'включено' : 'не включено',
      persisted ? '' : 'Без него браузер может стереть данные, если приложением долго не пользоваться. Копия файлом надёжнее любых обещаний браузера.',
    ));
  }

  function syncSay(text, kind = '') {
    const note = $('#s-note');
    note.textContent = text;
    note.className = `m-note ${kind}`;
    note.hidden = !text;
  }

  $('#s-save').addEventListener('click', async () => {
    await sync.setConfig({ url: $('#s-url').value, token: $('#s-token').value });
    $('#s-token').value = '';
    syncSay('Настройки сохранены.', 'is-ok');
    await refreshSync();
  });

  $('#s-check').addEventListener('click', async () => {
    syncSay('Проверяю…');
    try {
      await sync.check();
      syncSay('Связь есть, пропуск принят.', 'is-ok');
    } catch (e) {
      syncSay(`Не вышло: ${e.message}`, 'is-bad');
    }
  });

  $('#s-run').addEventListener('click', async () => {
    syncSay('Обмениваюсь…');
    try {
      const { pushed, refused, pulled } = await sync.run();
      // Отказ называется вслух и сразу: молчание про сеть - решение,
      // молчание про непринятую запись - потеря.
      syncSay(refused > 0
        ? `Отправлено ${pushed}, не принято ${refused}, получено ${pulled}.`
        : `Отправлено ${pushed}, получено ${pulled}.`,
      refused > 0 ? 'is-bad' : 'is-ok');
      await refresh();
      onChange?.();
    } catch (e) {
      syncSay(`Обмен не удался: ${e.message}`, 'is-bad');
    }
  });

  $('#m-recent').addEventListener('click', () => {
    close();
    onOpenRecent?.();
  });

  $('#m-export').addEventListener('click', async () => {
    try {
      const how = await exportToFile(store);
      say(how === 'share' ? 'Файл отправлен в системное меню.' : 'Файл сохранён в загрузки.', 'is-ok');
    } catch (e) {
      if (e.name === 'AbortError') return;         // пользователь передумал
      say(`Копию сделать не удалось: ${e.message}`, 'is-bad');
    }
  });

  $('#m-import').addEventListener('click', () => $('#m-file').click());

  $('#m-file').addEventListener('change', (e) => {
    pendingFile = e.target.files?.[0] ?? null;
    if (!pendingFile) return;
    say(`Выбран файл: ${pendingFile.name}`);
    $('#m-mode').hidden = false;
  });

  async function runImport(mode) {
    if (!pendingFile) return;
    try {
      await importFromFile(store, pendingFile, mode);
      say('Копия загружена.', 'is-ok');
      await refresh();
      onChange?.();
    } catch (e) {
      say(`Загрузить не удалось: ${e.message}`, 'is-bad');
    } finally {
      pendingFile = null;
      $('#m-file').value = '';
      $('#m-mode').hidden = true;
    }
  }

  $('#m-merge').addEventListener('click', () => runImport('merge'));
  $('#m-replace').addEventListener('click', () => runImport('replace'));
  $('#m-cancel').addEventListener('click', () => {
    pendingFile = null;
    $('#m-file').value = '';
    $('#m-mode').hidden = true;
    say('');
  });

  /* Стирание в два нажатия: системное окно подтверждения в приложении
     с ярлыка ведёт себя по-разному, а цена ошибки здесь максимальная. */
  $('#m-wipe').addEventListener('click', async () => {
    const btn = $('#m-wipe');
    if (!wipeArmed) {
      wipeArmed = true;
      btn.textContent = 'Нажмите ещё раз, чтобы стереть';
      setTimeout(() => {
        wipeArmed = false;
        btn.textContent = 'Стереть все данные';
      }, 5000);
      return;
    }
    await store.wipe();
    await store.init();
    wipeArmed = false;
    btn.textContent = 'Стереть все данные';
    say('Данные стёрты.', 'is-bad');
    await refresh();
    onChange?.();
  });

  $('.sheet-panel__close').addEventListener('click', close);
  $('.sheet-back').addEventListener('click', close);

  return {
    el,
    async open() { say(''); await refresh(); el.hidden = false; },
    close,
  };
}
