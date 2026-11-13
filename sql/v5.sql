-- Kot Delo? V5 (docs/SPLIT-V5.md, P3; contract V5 in contracts/api.md).
-- Run once in Supabase after v3.sql and v4.sql: SQL Editor -> paste -> Run. Safe to re-run.
-- Also: Authentication -> Providers -> Email on; "Confirm email" off for the demo (P1).

-- =====================================================================================
-- 1. Accounts: a complaint needs a signed-in user (Supabase Auth, email + password).
--    No profile table, no names. user_id is never returned to anyone but its owner.
-- =====================================================================================
alter table complaints add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists complaints_user_idx on complaints (user_id, created_at);

drop policy if exists "read all" on complaints;
drop policy if exists "insert" on complaints;
drop policy if exists "update" on complaints;
drop policy if exists "anon read" on complaints;
drop policy if exists "read own" on complaints;
drop policy if exists "insert signed in" on complaints;
-- Anon (public pages, /ops realtime): every row, but not the user_id column (column grant below).
create policy "anon read" on complaints for select to anon using (true);
-- A signed-in user reads only their own complaints.
create policy "read own" on complaints for select to authenticated using (user_id = auth.uid());
create policy "insert signed in" on complaints for insert to authenticated
  with check (auth.uid() is not null and user_id = auth.uid());
revoke select, insert, update, delete on complaints from anon;
grant select (id, street_id, category, created_at, status, is_demo) on complaints to anon;

-- /api/complaints calls this with the user id it verified from the access token.
-- Limits: same street + category within 6 h returns the same id; 5 complaints per user per hour.
create or replace function kd_user_complaint(p_user uuid, p_street bigint, p_category text)
returns jsonb language plpgsql as $$
declare v_id bigint; v_n int;
begin
  if p_user is null then return jsonb_build_object('ok', false, 'error', 'sign_in_required'); end if;
  perform pg_advisory_xact_lock(hashtext('kd_user:' || p_user::text));
  if not exists (select 1 from streets where id = p_street) then
    return jsonb_build_object('ok', false, 'error', 'unknown_street');
  end if;
  if p_category is null or p_category not in ('no_water','dirty_water','tanker_no_show','other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_category');
  end if;
  select id into v_id from complaints
    where user_id = p_user and street_id = p_street and category = p_category and created_at > now() - interval '6 hours'
    order by id desc limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', true);
  end if;
  select count(*) into v_n from complaints where user_id = p_user and created_at > now() - interval '1 hour';
  if v_n >= 5 then
    return jsonb_build_object('ok', false, 'error', 'throttled', 'retry_after_s', 3600);
  end if;
  insert into complaints (street_id, category, user_id) values (p_street, p_category, p_user) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false);
end $$;

revoke all on function kd_user_complaint(uuid, bigint, text) from public, anon, authenticated;
grant execute on function kd_user_complaint(uuid, bigint, text) to service_role;
-- Guests can no longer file complaints.
revoke all on function kd_guest_complaint(uuid, bigint, text) from service_role;

-- =====================================================================================
-- 2. Requests carry no litres: one request = one household. A household never picks tank size.
--    Dispatch plans each household as kd_household_litres() (DEMO, ops-side; HOUSEHOLD_L in
--    lib/queries.ts). requests.litres stays for old rows and is ignored from now on.
-- =====================================================================================
create or replace function kd_household_litres() returns int language sql immutable as $$ select 20 $$;

-- Same signature as v3 so existing grants and callers keep working; p_litres is ignored.
create or replace function kd_guest_request(p_session uuid, p_street bigint, p_litres int)
returns jsonb language plpgsql as $$
declare v_id bigint; v_n int;
begin
  perform pg_advisory_xact_lock(hashtext('kd_session:' || p_session::text));
  if not exists (select 1 from streets where id = p_street) then
    return jsonb_build_object('ok', false, 'error', 'unknown_street');
  end if;
  select q.id into v_id from session_actions a join requests q on q.id = a.ref_id
    where a.session_id = p_session and a.kind = 'request' and a.street_id = p_street and q.status = 'waiting'
    order by q.id limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', true);
  end if;
  select count(*) into v_n from session_actions a join requests q on q.id = a.ref_id
    where a.session_id = p_session and a.kind = 'request' and q.status = 'waiting';
  if v_n >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many_open_requests');
  end if;
  insert into requests (street_id, status) values (p_street, 'waiting') returning id into v_id;
  insert into session_actions (session_id, kind, street_id, ref_id) values (p_session, 'request', p_street, v_id);
  return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false);
end $$;

-- v4 capped load, now planning every waiting request as one household.
create or replace function kd_allocate_load_max(p_tanker bigint, p_key text, p_split boolean, p_max int)
returns jsonb language plpgsql as $$
declare
  v_cap int; v_left int; v_round bigint; v_stop bigint; v_street bigint; v_order int := 0;
  v_take int; v_total int := 0; r record;
begin
  perform pg_advisory_xact_lock(hashtext('kd_dispatch'));
  if p_key is not null then
    select id into v_round from rounds where dispatch_key = p_key;
    if v_round is not null then
      return jsonb_build_object('ok', true, 'round_id', v_round, 'duplicate', true);
    end if;
  end if;
  if p_max is not null and p_max <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_capacity');
  end if;
  select least(capacity_litres, coalesce(p_max, capacity_litres)) into v_cap from tankers where id = p_tanker and active;
  if v_cap is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_tanker');
  end if;
  select id into v_round from rounds where tanker_id = p_tanker and status in ('planned','active');
  if v_round is not null then
    return jsonb_build_object('ok', false, 'error', 'tanker_busy', 'round_id', v_round);
  end if;
  v_left := v_cap;
  for r in
    select q.id, q.street_id,
           kd_household_litres() - coalesce((select sum(a.litres) from allocations a
                                               where a.request_id = q.id and a.released_at is null), 0) as outstanding
    from requests q join streets s on s.id = q.street_id
    where q.status = 'waiting'
    order by s.order_index, q.created_at, q.id
  loop
    exit when v_left <= 0;
    continue when r.outstanding <= 0;
    continue when r.outstanding > v_left and not p_split;
    v_take := least(r.outstanding, v_left);
    if v_round is null then
      insert into rounds (status, tanker_id, dispatch_key) values ('planned', p_tanker, p_key) returning id into v_round;
    end if;
    if v_street is distinct from r.street_id then
      v_order := v_order + 1;
      insert into round_stops (round_id, street_id, stop_order) values (v_round, r.street_id, v_order) returning id into v_stop;
      v_street := r.street_id;
    end if;
    insert into allocations (round_id, round_stop_id, request_id, litres) values (v_round, v_stop, r.id, v_take);
    v_left := v_left - v_take;
    v_total := v_total + v_take;
  end loop;
  if v_round is null then
    return jsonb_build_object('ok', false, 'error', 'no_outstanding_demand');
  end if;
  return jsonb_build_object('ok', true, 'round_id', v_round, 'duplicate', false,
    'litres', v_total, 'capacity_litres', v_cap, 'stops', v_order);
end $$;

-- v3 serve, with "fully delivered" measured against the household share.
create or replace function kd_serve_stop(p_tanker bigint, p_stop bigint)
returns jsonb language plpgsql as $$
declare v_round bigint; v_owner bigint; v_status text; v_served_at timestamptz; v_n int;
begin
  select rs.round_id, r.tanker_id, r.status, rs.served_at into v_round, v_owner, v_status, v_served_at
    from round_stops rs join rounds r on r.id = rs.round_id where rs.id = p_stop for update of rs;
  if v_round is null then return jsonb_build_object('ok', false, 'error', 'unknown_stop'); end if;
  if v_owner is distinct from p_tanker then return jsonb_build_object('ok', false, 'error', 'not_your_round'); end if;
  if v_status <> 'active' then return jsonb_build_object('ok', false, 'error', 'round_not_active'); end if;
  if v_served_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'served_requests', 0);
  end if;
  update round_stops set served_at = now() where id = p_stop;
  update allocations set delivered_at = now() where round_stop_id = p_stop and delivered_at is null and released_at is null;
  update requests q set status = 'served'
    where q.status = 'waiting'
      and q.id in (select request_id from allocations where round_stop_id = p_stop)
      and kd_household_litres() <= (select coalesce(sum(a.litres), 0) from allocations a
                                    where a.request_id = q.id and a.delivered_at is not null and a.released_at is null);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'already', false, 'served_requests', v_n);
end $$;

revoke all on function kd_household_litres() from public, anon, authenticated;
grant execute on function kd_household_litres() to service_role;

-- =====================================================================================
-- 3. Places for all of Mauritius (OSM via scripts/fetch-osm.ts -> data/localities.csv).
--    Loaded with the service key by scripts/load-data.ts. Read-only for everyone else.
-- =====================================================================================
create table if not exists localities (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null,          -- OSM place=*: city | town | village | suburb | hamlet | locality
  district text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  source text not null,
  unique (name, district)
);
alter table localities enable row level security;
drop policy if exists "read all" on localities;
create policy "read all" on localities for select using (true);

-- =====================================================================================
-- 4. Notices feed: scraped (scripts/scrape-notices.ts) or pasted by ops, read by the AI parser
--    (POST /api/notices/parse). Extends the v3 notices table; v3 rows keep working (url null).
-- =====================================================================================
alter table notices add column if not exists url text;
create unique index if not exists notices_url_key on notices (url);
alter table notices add column if not exists published_on date;
alter table notices add column if not exists source text;            -- cwa | gis | news | ops_paste
alter table notices add column if not exists raw_text text;
alter table notices add column if not exists localities text[] not null default '{}';
alter table notices add column if not exists start_time time;
alter table notices add column if not exists end_time time;
alter table notices add column if not exists dates date[] not null default '{}';
alter table notices add column if not exists summary text;
alter table notices add column if not exists ai_extracted boolean not null default false;
alter table notices add column if not exists demo boolean not null default false;
alter table notices alter column locality drop not null;
alter table notices alter column title drop not null;
alter table notices alter column source_date drop not null;
alter table notices drop constraint if exists notices_kind_check;
alter table notices add constraint notices_kind_check check (kind in ('interruption','rationing','advisory','other'));
create index if not exists notices_published_idx on notices (published_on desc);
