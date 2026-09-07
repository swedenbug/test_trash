/*
  backup.js - выгрузка и загрузка данных файлом.
  Назначение: перенести данные между устройствами и сделать копию,
  которую не сотрёт браузер.
  Зависимости: store.

  На iPhone обычное скачивание файла ведёт себя непредсказуемо, особенно
  когда приложение открыто с ярлыка. Поэтому сначала пробуем системное
  «Поделиться» - оно кладёт файл в «Файлы» или отправляет куда угодно, -
  и только если его нет, скатываемся к ссылке на скачивание.
*/

export function fileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `progress-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`;
}

/**
 * Отдаёт выгрузку пользователю доступным способом.
 * @returns {'share'|'download'} каким путём ушло
 */
export async function exportToFile(store) {
  const dump = await store.exportAll();
  const text = JSON.stringify(dump, null, 2);
  const name = fileName();

  const file = new File([text], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Копия данных' });
    return 'share';
  }

  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'download';
}

/**
 * Читает выбранный файл и вливает его в хранилище.
 * @param {File} file
 * @param {'merge'|'replace'} mode
 */
export async function importFromFile(store, file, mode = 'merge') {
  const text = await file.text();

  let dump;
  try {
    dump = JSON.parse(text);
  } catch (e) {
    throw new Error('файл повреждён или это не JSON');
  }

  return store.importAll(dump, { mode });
}
