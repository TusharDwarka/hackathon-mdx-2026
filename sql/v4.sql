-- Kot Delo? V4 (docs/WATER-DAY-SPLIT.md, P3): official water quality / boil notices for op 26.
-- Run once in Supabase after v3.sql: SQL Editor -> paste -> Run. Safe to re-run. Additive only.
-- Loaded with the service key from data/quality_notices.csv (area,day,title,category,source_url)
-- by scripts/load-data.ts. OFFICIAL notices only (CWA / Ministry of Health); an empty file is fine.

create table if not exists quality_notices (
  id bigint generated always as identity primary key,
  area text not null,                         -- as written in the source
  area_id bigint references areas(id),        -- null = not mapped to a known area (never guessed)
  island_wide boolean not null default false, -- "island-wide" / "all": applies to every area
  day date not null,                          -- date of the notice
  title text not null,
  category text not null check (category in ('boil','quality')),
  source_url text not null,
  unique (area, day, title)
);

alter table quality_notices enable row level security;
drop policy if exists "read all" on quality_notices;
create policy "read all" on quality_notices for select using (true);
