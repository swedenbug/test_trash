# Карта кода

Что каждый модуль отдаёт наружу. Для написания ТЗ этого достаточно - реализации читать
не нужно, а когда нужно, файл называется здесь.

Пересобирается при изменении публичных интерфейсов. Внутренние функции не перечисляются.

---

## Ядро

### `src/core/schema.js`

Описание таблиц и проверка записей. Хранения и интерфейса не знает.

```js
SCHEMA_VERSION            // число, сейчас 3
schema                    // { имя: { label, orderBy, fields, derive? } }
collections               // ['theme','theme_goal','entry','settings','sync_state','meta']
SYNCED                    // ['theme','theme_goal','entry','settings'] - что уезжает на сервер
defaultSettings           // значения настроек по умолчанию

newId()                   // uuid, crypto.randomUUID с запасным путём
nowIso()                  // текущее время ISO
localDate(iso, dayStartHour = 0)   // 'ГГГГ-ММ-ДД' с учётом границы суток
validate(collection, record)       // { ok, errors[] }; схема закрыта, лишнее поле - ошибка
normalize(collection, input, ctx)  // проставляет id, метки времени, значения по умолчанию
```

Типы полей: `id`, `string`, `int`, `enum`, `bool`, `timestamp`, `date`, `json`.
У `json` признак `array` требует массива: на такой колонке сервер держит
`jsonb_typeof = 'array'`, и без местной проверки расхождение вернулось бы отказом
через один обмен.

Значения по умолчанию - только `day_start_hour`. Водные ключи ушли вместе с водой.
Границы и списки значений совпадают с `server/schema.sql` поле в поле: расхождение
даёт запись, которая проходит местную проверку и отвергается сервером.
Описание поля: `{ type, required?, nullable?, default?, min?, max?, values? }`.

### `src/core/adapter-local.js`

```js
createLocalAdapter({ prefix = 'pr:v1:' })
  → { name, readAll(c), writeAll(c, rows), upsert(c, row), drop(c), usage(list) }
```

Одна таблица - один ключ, значение массив JSON. Битый JSON поднимает ошибку, а не
возвращает пустой массив.

### `src/core/store.js`

Единственная точка доступа к данным. Все методы асинхронные.

```js
createStore(adapter) → {
  adapterName,
  list(c, { from, to, includeDeleted, limit })   // сортировка по orderBy, по убыванию
  get(c, id), count(c, opts)
  put(c, input)                 // normalize + validate + upsert + оповещение
  remove(c, id)                 // мягкое удаление
  restore(c, id)                // возврат из удалённых
  mergeIncoming(c, rows)        // приём чужих записей, не трогает updated_at
  setting(key), setSetting(key, value)
  onChange(c, handler) → отписка
  exportAll(), importAll(dump, { mode: 'merge' | 'replace' })
  init()                        // миграция до текущей версии, вызывается первой
  meta(), usage(), quota(), requestPersistence(), isPersisted()
  wipe()
}
```

### `src/core/migrate.js`

```js
migrate(adapter) → { from, to, applied[] }
```

Шаги хранятся в объекте `steps`, ключ - версия, в которую переводим. Получают адаптер
напрямую: проверка схемы на промежуточных версиях бессмысленна.

### `src/core/sync.js`

```js
createSync(store) → {
  config(), setConfig({ url, token })
  check()            // связь и пропуск, без обмена данными
  state()            // { configured, url, lastSync, pending, rejected }
  rejectedList()     // [{ id, table, reason, at }] - что не принял сервер
  retryRejected()    // снять пометки и отмотать курсор, вернуть число снятых
  run()              // { pushed, refused, pulled, at }; сначала отдаём, потом забираем
}
```

Курсоры и настройки лежат в коллекции `sync_state`, на сервер не уезжают.

Записи, отвергнутые сервером, лежат в `settings` под ключом `sync.rejected` и из обмена
исключены. Повторно такая запись не отправляется, пока не изменится её `updated_at`.
`retryRejected` нужен, когда причину устранили на сервере: править на устройстве нечего,
а курсор к тому времени уже ушёл вперёд - снятия пометки одного не хватит.

### `src/core/backup.js`

```js
fileName(date)                        // 'progress-ГГГГ-ММ-ДД.json'
exportToFile(store) → 'share'|'download'
importFromFile(store, file, mode)
```

### `src/core/check.js`

Двадцать четыре проверки ядра, написаны на `theme` и `entry`. Работает в пространстве
ключей `pr:test:`, убирает за собой.
Экспортов нет, подключается из `check.html`.

---

## Темы

### `src/modules/engine.js`

Один модуль на все темы. Знает `core`, разметки не знает вовсе.

```js
TAP, HOLD, MANUAL                     // значения source
createEngine(store) → {
  list()                              // активные темы без групп, по возрастанию sort
  get(themeId)
  goalFor(themeId, date)              // норма на дату, историей; null если нормы нет
  setGoal(themeId, value, fromDate?)  // действует с даты, прошлое не переписывает
  progress(themeId, date?)            // { date, value, goal, ratio, state, count }
  getUrgency(themeId, now?)           // контракт 1: + { level, urgency, since, fill, summary }
  add(themeId, value, source)         // { record, removed }
  remove(id), restore(id)
  labelFor(themeId, record)           // подпись для таблетки отмены, до 24 символов
  getRecent(since)                    // контракт 2: [{ id, moduleId, at, title, detail }]
  removeRecord(id), restoreRecord(id)
}
```

`state`: `idle`, `done`, `broken`. У `at_least` день закрывается в момент достижения
нормы. У `at_most` пока день идёт - `idle`, `done` только по его завершении,
превышение - `broken`. Считается по живым записям: отменённая запись в счёт не идёт.

`level` берётся из `urgency_kind`: `time_since` - минуты с последней записи против
`soft_after` и `hard_after`, `day_left` - минуты до конца суток, `none` - всегда `done`.
Пороги в минутах, заданными считаются только числа. Уровень нигде не хранится
и считается при отрисовке - поэтому сдвиг порога переставляет кружки сразу.

`series`, `intakesOn` и экран темы - заход 4б. Отдельно наружу они не выведены,
пока ими никто не пользуется.

---

## Интерфейс

Правило слоя: рисует по переданным данным, хранилище не читает.

### `src/ui/circle.js`

```js
DROP                       // путь капли, для обратной совместимости
circleSvg({
  size, level,             // 'done' | 'soft' | 'hard'
  fill,                    // 0…1 и выше
  emblem, color,
  content,                 // 'fill'|'solid'|'detail'|'letter'|'value'|'percent'
  text, value, goal,
  percent,                 // число поверх фигуры либо null
  hold,                    // { lap: 1|2, progress: 0…1 }
  state,                   // 'normal'|'loading'|'error'
  glyph                    // буква вместо знака, устаревает
}) → строка SVG
```

Геометрия: кольцо `r=46` толщиной 4, подложка `r=38`, зазор 6. Свечение под кольцом -
та же окружность толщиной 7 с размытием 3.5.

### `src/ui/emblems.js`

```js
EMBLEMS, EMBLEM_IDS        // 24 силуэта: { name, path }
BOXES                      // габариты каждого знака, снятые браузером
fitTransform(id, side)     // строка transform: центрирование и подгонка
emblemSvg(id, { size, color, fill })     // fill = null → сплошной
DETAILS, DETAIL_IDS, detailSvg(id, opts) // 12 подробных знаков линиями
```

### `src/ui/card.js`

```js
chartBlock({ views, page, series, goal })   // внутренности блока графика
availableViews({ dayLine, weekLine, weekBars })
cardHtml({ theme, title, description, value, goal, unit, foot,
           series, views, page, background, glyph, color })
```

### `src/ui/chart.js`

```js
dayCumulative(points, goal, { from, to })   // points: [{ hour, ml }]
weekCumulative(days, weekGoal)              // days: [{ day, ml }]
weekBars(days)                              // days: [{ day, pct, today? }]
```

Линии и столбики белые: график лежит поверх изображения.

### `src/ui/gestures.js`

```js
attachHold(el, { first = 1000, second = 3000,
                 onTap, onFirst, onSecond, onProgress }) → отписка
attachSwipe(el, { onLeft, onRight })
```

Сдвиг больше 10 пикселей отменяет удержание. Свайп у края экрана игнорируется -
там Safari перехватывает жест «назад».

### `src/ui/undo.js`

```js
createUndo(mount) → {
  push({ label, onUndo }),   // стопка, 7 секунд на вершину
  close()
}
```

### Панели

```js
createMenu({ store, sync, onChange, onOpenRecent }) → { el, open(), close() }
createRecent({ themes, undo, onChange })  → { el, open(), close(), refresh() }
```

`themes` для ленты: `[{ id, short, color, getRecent, removeRecord, restoreRecord }]`.

### Макеты, в приложение не входят

```js
createThemeForm(mount)   // форма создания темы, states-theme.html
createToday(mount)       // вкладка «Сегодня», states-today.html
createLooks(mount)       // пять концепций, states-looks.html
```

### `src/app.js`

Сборка приложения. Экспортов нет. Создаёт хранилище, движок, обмен, панели; рисует
шапку, ряд кружков и нижние переходы; вешает жесты на каждый кружок. Одна подписка
на изменение данных обновляет все открытые виды.

Ни одной темы не знает: сколько их, какие у них знаки, цвета и пороги - спрашивает
у движка. Проверка правила слоёв: чтобы завести тему, этот файл править не нужно.

**Отписки от жестов хранятся и снимаются перед каждой перерисовкой.** Разметка
заменяется целиком, и обработчик, оставшийся на выброшенном элементе, продолжает
кадровый цикл: рисует кольцо удержания, которого никто не держит, и через три секунды
сообщает о переходе, которого не было. Перерисовку приносит обмен - отсюда «иногда».

Лента карточек, графики и экран темы - заход 4б.

---

## Сервер

### `server/index.js`

```
GET  /health                    { ok, now }
GET  /changes?since=<ISO>       { now, truncated, changes: { таблица: [строки] } }
POST /changes  { changes }      { accepted: { таблица: число }, rejected: [...], now }
```

`rejected`: `[{ table, id, reason }]`, причина - `unknown_field`, `missing_field`,
`constraint` или `bad_json`.

Пропуск заголовком `Authorization: Bearer`, сравнение постоянного времени.
Список таблиц и полей задан в коде константой `TABLES` и запросами не расширяется;
поле вне перечня отвергает запись, а не выбрасывается молча.

Приём в одной транзакции на пачку и `savepoint` на запись: негодная строка
отбрасывается поштучно, пачка принимается. Обновление только если `updated_at` новее.

Колонки `jsonb` готовятся строкой явно, иначе драйвер сериализует массив в литерал
массива Postgres. Колонки `date` отдаются как `ГГГГ-ММ-ДД` - `setTypeParser(1082)`
до создания пула.

### `server/schema.sql`

Шесть таблиц: `theme`, `theme_goal`, `entry` - схема движка, поле в поле с устройством;
`water_intake`, `water_goal`, `settings` - прежние, уходят после захода 4.
Индексы по `updated_at` - основной запрос обмена. В конце три `alter table … owner`:
схема, применённая не тем пользователем, оставляет службу без прав.

---

## Стили

| Файл | Что внутри |
|---|---|
| `tokens.css` | Цвета, шрифты, отступы, палитра тем, ширина колонки |
| `base.css` | Сброс, типографика, список проверок, `[hidden]` |
| `card.css` | Карточка темы, график, точки-указатели |
| `home.css` | Зоны экрана, кружки, меню, таблетка, панели, лента, «Сегодня» |
| `preview.css` | Только витрины: форма темы, знаки, блоки |
| `looks.css` | Пять концепций оформления, после выбора удаляется |

Все размеры и цвета берутся из `tokens.css`. Хардкодных цветов в остальных файлах быть
не должно.

---

## Оснастка

| Файл | Что делает |
|---|---|
| `tools/stamp.ps1` | Пишет `src/version.js` и пересобирает список сумм. Последнее действие захода |
| `tools/check-files.ps1` | Сверяет состав и свежесть файлов по списку сумм |
| `tools/serve.py` | Локальный сервер, порт 8000, `Cache-Control: no-store` |

`src/version.js` отдаёт `VERSION = { stamp, built }` - отпечаток собранной версии,
он же первой строкой в меню. Считается по содержимому файлов, а не по хешу коммита:
файл с хешем лежал бы внутри того же коммита. Нужен затем, что GitHub Pages держит
кэш десять минут, и без него «правка не работает» неотличимо от «правка не доехала».
