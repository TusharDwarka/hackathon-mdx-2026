-- Kot Delo? V2 additions (contracts/api.md "V2 additions"). Run once in Supabase after schema.sql:
-- SQL Editor -> paste -> Run. Safe to re-run (if not exists / drop policy if exists).
-- Complaints are stored by street + category only: no house, person, free text or device id.

create table if not exists complaints (
  id bigint generated always as identity primary key,
  street_id bigint not null references streets(id),
  category text not null check (category in ('no_water','dirty_water','tanker_no_show','other')),
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','resolved'))
);

-- Loaded with the service key from data/reservoir.csv (reservoir,day,level_pct,source_url).
create table if not exists reservoir_levels (
  id bigint generated always as identity primary key,
  reservoir text not null,
  day date not null,
  level_pct double precision not null,
  source_url text,
  unique (reservoir, day)
);

alter table complaints enable row level security;
alter table reservoir_levels enable row level security;

-- Anon: read all, insert complaints, update complaints (status -> 'resolved' from /ops).
drop policy if exists "read all" on complaints;
drop policy if exists "insert" on complaints;
drop policy if exists "update" on complaints;
drop policy if exists "read all" on reservoir_levels;
create policy "read all" on complaints for select using (true);
create policy "insert" on complaints for insert with check (true);
create policy "update" on complaints for update using (true);
create policy "read all" on reservoir_levels for select using (true);

-- Realtime: /ops sees new complaints live (reservoir levels change daily, no realtime needed).
alter publication supabase_realtime add table complaints;
