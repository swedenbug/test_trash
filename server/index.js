/*
  index.js — обмен данными между устройством и Postgres.
  Зависимости: pg.

  Две ручки и ничего больше:
    GET  /changes?since=<ISO>   отдать всё, что изменилось после указанного момента
    POST /changes               принять пачку изменений
    GET  /health                жив ли

  Готовые надстройки, превращающие таблицы в сетевой доступ автоматически,
  сюда не берутся сознательно: они тянут роли базы и построчные права,
  где ошибка в одном правиле открывает всё. Здесь список таблиц и полей
  задан в коде и никакими запросами не расширяется.
*/

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/* --- настройки ---------------------------------------------------- */

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(here, '.env'));

const DATABASE_URL = need('DATABASE_URL');
const SYNC_TOKEN = need('SYNC_TOKEN');
const ALLOWED = (process.env.ALLOWED_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT = Number(process.env.PORT ?? 8787);

const MAX_BODY = 4 * 1024 * 1024;   // больше четырёх мегабайт за раз не бывает
const PAGE = 2000;                  // столько строк отдаём за один запрос

/*
  Белый список. Ни одно имя таблицы или поля не приходит снаружи:
  что не перечислено здесь, того для сервера не существует.
*/
const TABLES = {
  water_intake: ['id', 'at', 'local_date', 'amount_ml', 'source', 'note',
                 'created_at', 'updated_at', 'deleted_at'],
  water_goal:   ['id', 'ml', 'effective_from', 'created_at', 'updated_at', 'deleted_at'],
  settings:     ['id', 'value', 'updated_at'],

  theme:        ['id', 'name', 'short', 'description', 'parent_id', 'kind', 'unit',
                 'direction', 'goal_period', 'urgency_kind', 'soft_after', 'hard_after',
                 'quick', 'color', 'emblem', 'fill', 'sort', 'active',
                 'created_at', 'updated_at', 'deleted_at'],
  theme_goal:   ['id', 'theme_id', 'value', 'effective_from',
                 'created_at', 'updated_at', 'deleted_at'],
  entry:        ['id', 'theme_id', 'at', 'local_date', 'value', 'source', 'note',
                 'created_at', 'updated_at', 'deleted_at'],
};

/*
  Колонки jsonb. Объект драйвер сериализует в JSON сам, а массив — в литерал
  массива Postgres: [250, 1000] уехало бы как {250,1000}, и jsonb такое не примет.
  Поэтому значение таких колонок готовим строкой явно, не полагаясь на драйвер.
*/
const JSONB = {
  settings: ['value'],
  theme:    ['quick'],
};

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

/* --- сервер -------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url, 'http://localhost');

  cors(res, origin);

  if (req.method === 'OPTIONS') return end(res, 204, '');

  if (url.pathname === '/health') {
    return json(res, 200, { ok: true, now: new Date().toISOString() });
  }

  if (url.pathname !== '/changes') return json(res, 404, { error: 'нет такой ручки' });

  if (!authorized(req)) return json(res, 401, { error: 'пропуск не принят' });

  try {
    if (req.method === 'GET') return await handlePull(url, res);
    if (req.method === 'POST') return await handlePush(req, res);
    return json(res, 405, { error: 'метод не поддерживается' });
  } catch (e) {
    console.error('ошибка обработки:', e);
    return json(res, 500, { error: 'внутренняя ошибка' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Обмен слушает 127.0.0.1:${PORT}`);
  console.log(`Разрешённые источники: ${ALLOWED.join(', ') || 'ни одного — обращения из браузера будут отклонены'}`);
});

/* --- ручки --------------------------------------------------------- */

/** Отдать изменения после указанного момента. */
async function handlePull(url, res) {
  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw))
    ? sinceRaw
    : '1970-01-01T00:00:00.000Z';

  const changes = {};
  let truncated = false;

  for (const [table, columns] of Object.entries(TABLES)) {
    const list = columns.join(', ');
    const { rows } = await pool.query(
      `select ${list} from ${table} where updated_at > $1 order by updated_at asc limit ${PAGE}`,
      [since],
    );
    changes[table] = rows;
    if (rows.length === PAGE) truncated = true;
  }

  /*
    Отметку берём у базы, а не у себя: часы устройства и часы сервера
    расходятся, и курсор, посчитанный не там, начнёт терять записи.
  */
  const { rows: [{ now }] } = await pool.query('select now() as now');

  return json(res, 200, {
    now: new Date(now).toISOString(),
    truncated,                       // правда — значит нужен ещё один заход
    changes,
  });
}

/** Принять пачку изменений. Побеждает более поздняя правка. */
async function handlePush(req, res) {
  const body = await readBody(req);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return json(res, 400, { error: 'тело запроса не разобрано' });
  }

  const incoming = payload?.changes;
  if (!incoming || typeof incoming !== 'object') {
    return json(res, 400, { error: 'нет раздела changes' });
  }

  const accepted = {};
  const client = await pool.connect();

  try {
    await client.query('begin');

    for (const [table, columns] of Object.entries(TABLES)) {
      const rows = Array.isArray(incoming[table]) ? incoming[table] : [];
      const jsonb = JSONB[table] ?? [];
      let count = 0;

      for (const row of rows) {
        if (!row || typeof row.id !== 'string' || !row.updated_at) continue;

        const values = columns.map((c) => {
          const v = row[c] === undefined ? null : row[c];
          return jsonb.includes(c) && v !== null ? JSON.stringify(v) : v;
        });
        const holders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const updates = columns.filter((c) => c !== 'id')
          .map((c) => `${c} = excluded.${c}`).join(', ');

        const { rowCount } = await client.query(
          `insert into ${table} (${columns.join(', ')}) values (${holders})
           on conflict (id) do update set ${updates}
           where ${table}.updated_at < excluded.updated_at`,
          values,
        );
        count += rowCount;
      }

      accepted[table] = count;
    }

    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    console.error('пачка отклонена целиком:', e.message);
    return json(res, 400, { error: `пачка не принята: ${e.message}` });
  } finally {
    client.release();
  }

  const { rows: [{ now }] } = await pool.query('select now() as now');
  return json(res, 200, { accepted, now: new Date(now).toISOString() });
}

/* --- служебное ----------------------------------------------------- */

function authorized(req) {
  const header = req.headers.authorization ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';

  /* Сравнение постоянного времени: обычное «равно» подсказывает длину
     и первые совпавшие символы тому, кто измеряет время ответа. */
  const a = Buffer.from(given);
  const b = Buffer.from(SYNC_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cors(res, origin) {
  if (origin && ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('тело запроса слишком велико'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, code, data) {
  const text = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

function end(res, code, text) {
  res.writeHead(code);
  res.end(text);
}

function need(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Не задано ${name}. Смотри env.example.`);
    process.exit(1);
  }
  return value;
}

/* Разбор .env без сторонней библиотеки: строки вида КЛЮЧ=значение. */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    const eq = clean.indexOf('=');
    if (eq === -1) continue;
    const key = clean.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = clean.slice(eq + 1).trim();
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\nОстанавливаюсь.');
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
