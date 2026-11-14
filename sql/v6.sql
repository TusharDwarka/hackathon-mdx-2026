-- Kot Delo? V6 (P3): one row per street, one row per schedule slot.
-- Fixes the duplicate Vacoas streets on the live database (ids 1-21 and 22-42): the old
-- scripts/load-data.ts did "delete all streets, insert all streets" and ignored the delete error,
-- so once a report pointed at a street the delete failed silently and every street was inserted again.
-- Run once in Supabase after v5.sql: SQL Editor -> paste -> Run. Safe to re-run.
-- Afterwards `npm run load-data` upserts streets on (area_id, name) and can never duplicate them again.

-- =====================================================================================
-- 1. Merge duplicate streets: for each (area_id, name) keep the oldest row (lowest id),
--    re-point every reference to it, then delete the copies.
-- =====================================================================================
drop table if exists street_dupes;
create temp table street_dupes as
  select s.id as dupe_id, k.keep_id
  from streets s
  join (select area_id, name, min(id) as keep_id from streets group by area_id, name) k
    on k.area_id = s.area_id and k.name = s.name
  where s.id <> k.keep_id;

update reports r set street_id = d.keep_id from street_dupes d where r.street_id = d.dupe_id;
update requests q set street_id = d.keep_id from street_dupes d where q.street_id = d.dupe_id;
update round_stops rs set street_id = d.keep_id from street_dupes d where rs.street_id = d.dupe_id;

do $$
begin
  if to_regclass('public.complaints') is not null then
    update complaints c set street_id = d.keep_id from street_dupes d where c.street_id = d.dupe_id;
  end if;
  if to_regclass('public.session_actions') is not null then
    update session_actions a set street_id = d.keep_id from street_dupes d where a.street_id = d.dupe_id;
  end if;
end $$;

-- A round that listed both copies now has the same street twice: drop the later, unserved stop.
delete from round_stops rs
using round_stops keep
where keep.round_id = rs.round_id
  and keep.street_id = rs.street_id
  and keep.id < rs.id
  and rs.served_at is null;

delete from streets s using street_dupes d where s.id = d.dupe_id;

-- =====================================================================================
-- 2. Duplicate schedule slots (same area, day and times): keep the oldest. Nothing references schedule.
-- =====================================================================================
delete from schedule s
using schedule keep
where keep.area_id = s.area_id and keep.day = s.day
  and keep.start_time = s.start_time and keep.end_time = s.end_time
  and keep.id < s.id;

-- =====================================================================================
-- 3. Keys so a re-run of load-data upserts instead of inserting copies.
-- =====================================================================================
create unique index if not exists streets_area_name_key on streets (area_id, name);
create unique index if not exists schedule_area_slot_key on schedule (area_id, day, start_time, end_time);
