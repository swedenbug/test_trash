-- schema.sql — структура базы на сервере.
-- Повторяет схему на устройстве: те же таблицы, те же поля, те же ограничения.
-- Применить:  psql -U progress -d progress -f schema.sql

create table if not exists water_intake (
  id          uuid primary key,
  at          timestamptz not null,
  local_date  date        not null,
  amount_ml   integer     not null check (amount_ml > 0 and amount_ml <= 5000),
  source      text        not null check (source in ('tap', 'hold', 'manual')),
  note        text,
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  deleted_at  timestamptz
);

create table if not exists water_goal (
  id              uuid primary key,
  ml              integer     not null check (ml between 200 and 10000),
  effective_from  date        not null,
  created_at      timestamptz not null,
  updated_at      timestamptz not null,
  deleted_at      timestamptz
);

create table if not exists settings (
  id          text  primary key,
  value       jsonb not null,
  updated_at  timestamptz not null
);

-- Основной запрос обмена — «что изменилось после такого-то момента».
create index if not exists water_intake_updated_idx on water_intake (updated_at);
create index if not exists water_goal_updated_idx   on water_goal   (updated_at);
create index if not exists settings_updated_idx     on settings     (updated_at);

-- Вспомогательные, для ручных разборов через psql.
create index if not exists water_intake_day_idx on water_intake (local_date);
