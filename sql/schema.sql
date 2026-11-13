-- Kot Delo? schema. Run once in Supabase: SQL Editor -> paste -> Run.
-- Reports/requests are stored by street only, never by house or person.

create table if not exists areas (
  id bigint generated always as identity primary key,
  name text not null unique
);
create table if not exists streets (
  id bigint generated always as identity primary key,
  area_id bigint not null references areas(id),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  order_index int not null
);
create table if not exists schedule (
  id bigint generated always as identity primary key,
  area_id bigint not null references areas(id),
  day text not null,                -- 'Mon'..'Sun' or 'YYYY-MM-DD'
  start_time time not null,
  end_time time not null,
  source_url text,
  source_date date
);
create table if not exists reports (
  id bigint generated always as identity primary key,
  street_id bigint not null references streets(id),
  type text not null check (type in ('water_on','water_off')),
  created_at timestamptz not null default now(),
  is_demo boolean not null default false
);
create table if not exists requests (
  id bigint generated always as identity primary key,
  street_id bigint not null references streets(id),
  created_at timestamptz not null default now(),
  status text not null default 'waiting' check (status in ('waiting','served'))
);
create table if not exists rounds (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active','done'))
);
create table if not exists round_stops (
  id bigint generated always as identity primary key,
  round_id bigint not null references rounds(id),
  street_id bigint not null references streets(id),
  stop_order int not null,
  served_at timestamptz
);
create table if not exists truck_positions (
  id bigint generated always as identity primary key,
  round_id bigint not null references rounds(id),
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);

-- Row level security: no login in this app, so the anon key may read everything
-- and write only the tables the demo path needs. Reference data (areas, streets,
-- schedule) is loaded with the service key (scripts/load-data.ts).
alter table areas enable row level security;
alter table streets enable row level security;
alter table schedule enable row level security;
alter table reports enable row level security;
alter table requests enable row level security;
alter table rounds enable row level security;
alter table round_stops enable row level security;
alter table truck_positions enable row level security;

create policy "read all" on areas for select using (true);
create policy "read all" on streets for select using (true);
create policy "read all" on schedule for select using (true);
create policy "read all" on reports for select using (true);
create policy "read all" on requests for select using (true);
create policy "read all" on rounds for select using (true);
create policy "read all" on round_stops for select using (true);
create policy "read all" on truck_positions for select using (true);

create policy "insert" on reports for insert with check (true);
create policy "insert" on requests for insert with check (true);
create policy "insert" on rounds for insert with check (true);
create policy "insert" on round_stops for insert with check (true);
create policy "insert" on truck_positions for insert with check (true);
create policy "update" on requests for update using (true);
create policy "update" on rounds for update using (true);
create policy "update" on round_stops for update using (true);

-- Realtime for the live map and status updates
alter publication supabase_realtime add table truck_positions, round_stops, requests, rounds;
