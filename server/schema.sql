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

/* --- движок тем ------------------------------------------------------
   Заход 1: таблицы заведены и включены в обмен. Данные на устройствах
   пока лежат в water_intake и water_goal; те не трогаются до шага 3 плана.
   Внешних ключей нет намеренно: пачка обмена приходит в произвольном
   порядке, и запись может опередить свою тему.                       */

create table if not exists theme (
  id            uuid primary key,
  name          text        not null,
  short         text,
  description   text,
  parent_id     uuid,
  kind          text        not null check (kind in ('group','flag','count','time','scale','note')),
  unit          text,
  direction     text        check (direction in ('at_least','at_most')),
  goal_period   text        check (goal_period in ('day','week','none')),
  urgency_kind  text        not null check (urgency_kind in ('time_since','day_left','none')),
  soft_after    integer     check (soft_after >= 0),
  hard_after    integer     check (hard_after >= 0),
  quick         jsonb       not null default '[]'::jsonb check (jsonb_typeof(quick) = 'array'),
  color         text,
  emblem        text,
  fill          text        check (fill in ('emblem_fill','emblem_solid','emblem_detailed','glyph','value','percent')),
  sort          integer     not null default 0,
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table if not exists theme_goal (
  id              uuid primary key,
  theme_id        uuid        not null,
  value           integer     not null check (value > 0),
  effective_from  date        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table if not exists entry (
  id          uuid primary key,
  theme_id    uuid        not null,
  at          timestamptz not null,
  local_date  date        not null,
  value       integer     not null check (value >= 0),
  source      text        not null check (source in ('tap','hold','manual','timer','scenario')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- Под курсор обмена. Без них выборка изменений читает таблицу целиком,
-- и заметно это станет не сразу, а на нескольких тысячах записей.
create index if not exists entry_theme_day_idx    on entry      (theme_id, local_date);
create index if not exists entry_at_idx           on entry      (at desc);
create index if not exists entry_updated_idx      on entry      (updated_at);
create index if not exists theme_updated_idx      on theme      (updated_at);
create index if not exists theme_goal_theme_idx   on theme_goal (theme_id, effective_from);
create index if not exists theme_goal_updated_idx on theme_goal (updated_at);

/*
  Таблица принадлежит тому, кто её создал, а служба ходит в базу пользователем
  progress. Схему, применённую от postgres — например через sudo -u postgres psql,
  чтобы не набирать пароль, — служба потом читать не сможет: permission denied
  на каждой новой таблице. Владелец выставляется здесь, а не правилом в README:
  правило можно забыть, а на новой машине это стоит захода.
*/
alter table theme      owner to progress;
alter table theme_goal owner to progress;
alter table entry      owner to progress;
