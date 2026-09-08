/*
  migrate.js - переход между версиями схемы.
  Назначение: довести данные на устройстве до текущей версии схемы.
  Зависимости: schema.js.

  Механизм заведён заранее, пока миграций нет. Первое же изменение структуры
  без него означало бы либо потерю данных, либо разбор задним числом, какая
  версия лежит на каком устройстве.
*/

import { SCHEMA_VERSION, newId, nowIso } from './schema.js';

/*
  Каждый шаг поднимает данные на одну версию.
  Ключ - версия, в которую переводим. Функция получает адаптер напрямую:
  проверка схемы на промежуточных версиях бессмысленна, форма ещё чужая.

  Пример будущего шага:
    2: async (adapter) => {
      const rows = await adapter.readAll('water_intake');
      await adapter.writeAll('water_intake', rows.map((r) => ({ ...r, note: r.note ?? null })));
    },
*/
const steps = {
  // 2: появилась таблица состояния обмена. Данные не меняются, но версию
  // поднять нужно: иначе устройство со старой схемой примет новые записи молча.
  2: async (adapter) => {
    const rows = await adapter.readAll('sync_state');
    if (!rows.length) await adapter.writeAll('sync_state', []);
  },

  /*
    3: вода перестала быть отдельным модулем. Записи не переносятся - их нет:
    всё, что лежало в водных таблицах, было проверочным и накопилось при отладке
    обмена. Перенос ради этого стоил бы захода и требовал бы сохранения
    идентификаторов, полного обмена на каждом устройстве и месяца страховки.

    Шаг повторяем: удаление уже удалённого - не ошибка. Иначе второй запуск
    приложения падал бы на пустом месте, а выглядело бы это как порча данных.
  */
  3: async (adapter) => {
    for (const c of ['water_intake', 'water_goal']) {
      await adapter.drop(c);
    }

    const rows = await adapter.readAll('settings');
    const gone = rows.filter((r) => String(r.id).startsWith('water.'));
    if (gone.length) {
      await adapter.writeAll('settings', rows.filter((r) => !gone.includes(r)));
    }
  },
};

/**
 * Приводит хранилище к текущей версии схемы.
 * @returns {{from: number, to: number, applied: number[]}}
 */
export async function migrate(adapter) {
  const meta = (await adapter.readAll('meta'))[0] ?? null;
  const from = meta?.schema_version ?? 0;

  if (from > SCHEMA_VERSION) {
    throw new Error(
      `данные сделаны более новой версией приложения (${from} против ${SCHEMA_VERSION})`,
    );
  }

  const applied = [];
  for (let v = from + 1; v <= SCHEMA_VERSION; v++) {
    if (steps[v]) {
      await steps[v](adapter);
      applied.push(v);
    }
  }

  await adapter.writeAll('meta', [{
    id: 'meta',
    schema_version: SCHEMA_VERSION,
    device_id: meta?.device_id ?? newId(),
    updated_at: nowIso(),
  }]);

  return { from, to: SCHEMA_VERSION, applied };
}
