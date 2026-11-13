-- Kot Delo? V3 (docs/NEXT-TASK-SPLIT.md, P3 package): sessions + roles, request litres, tankers,
-- dispatch allocations, multi-driver rounds, all reservoirs, notices/advisories, supply volumes.
-- Run once in Supabase after schema.sql and v2.sql: SQL Editor -> paste -> Run. Safe to re-run.
--
-- ADDITIVE ONLY. The current screens keep working (anon writes are untouched).
-- sql/v3-lockdown.sql removes the anon write policies LATER, once P2/P4 call /api/* instead.
--
-- Privacy: still nothing by house or person. A session is an opaque random token (only its SHA-256
-- is stored), expires after 24 h (guest) or 12 h (driver/ops), and is readable by the service role
-- only. It exists for throttling and for counting independent reports, never for a profile.

-- ---------- 1. tankers (reference data; DEMO capacities, label them as such) ----------
create table if not exists tankers (
  id bigint generated always as identity primary key,
  name text not null unique,
  capacity_litres integer not null check (capacity_litres > 0),
  active boolean not null default true
);
insert into tankers (name, capacity_litres) values ('Demo tanker 1', 1000), ('Demo tanker 2', 1000)
  on conflict (name) do nothing;

-- ---------- 2. sessions (private: no anon policy at all) ----------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  role text not null check (role in ('guest','driver','ops')),
  tanker_id bigint references tankers(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint sessions_driver_has_tanker check ((role = 'driver') = (tanker_id is not null))
);
-- Which session wrote which report/request/complaint. Private: used for throttling and for
-- "independent sources" in report trust. Deleted with the session (cascade).
create table if not exists session_actions (
  id bigint generated always as identity primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  kind text not null check (kind in ('report','request','complaint')),
  street_id bigint not null references streets(id),
  ref_id bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists session_actions_by_session on session_actions (session_id, kind, created_at desc);
create index if not exists session_actions_by_ref on session_actions (kind, ref_id);

-- ---------- 3. requests: litres (positive; null only for rows created before V3) ----------
alter table requests add column if not exists litres integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'requests_litres_positive') then
    alter table requests add constraint requests_litres_positive check (litres > 0);
  end if;
end $$;

-- ---------- 4. rounds: one round = one tank-load of one tanker ----------
alter table rounds add column if not exists tanker_id bigint references tankers(id);
alter table rounds add column if not exists dispatch_key text unique; -- idempotency key from ops
alter table rounds drop constraint if exists rounds_status_check;
alter table rounds add constraint rounds_status_check check (status in ('planned','active','done'));
-- A tanker has at most one open (planned or active) round: a second load is a refill trip, later.
create unique index if not exists rounds_one_open_per_tanker on rounds (tanker_id) where status in ('planned','active');

-- ---------- 5. allocations: which litres of which request go on which load ----------
create table if not exists allocations (
  id bigint generated always as identity primary key,
  round_id bigint not null references rounds(id),
  round_stop_id bigint not null references round_stops(id),
  request_id bigint not null references requests(id),
  litres integer not null check (litres > 0),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  released_at timestamptz, -- round ended before delivery: the litres go back to pending demand
  unique (round_id, request_id)
);
create index if not exists allocations_by_request on allocations (request_id) where released_at is null;
create index if not exists allocations_by_stop on allocations (round_stop_id);

-- ---------- 6. complaints: demo flag so seed-demo never wipes real complaints ----------
alter table complaints add column if not exists is_demo boolean not null default false;

-- ---------- 7. reservoirs: every reservoir, with how the date was established ----------
alter table reservoir_levels add column if not exists date_basis text;   -- data_date | article_date | reported
alter table reservoir_levels add column if not exists is_aggregate boolean not null default false; -- "all 7 reservoirs" total

-- ---------- 8. official notices / advisories and locality supply volumes ----------
-- Loaded with the service key from data/notices.csv and data/supply.csv (scripts/load-data.ts).
-- locality = the name as written in the source; area_id = null when it matches no known area.
create table if not exists notices (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('interruption','rationing','advisory')),
  topic text check (topic in ('rainfall_flooding','cyclone','drought','chemical_fuel','water_quality','other')),
  locality text not null,
  area_id bigint references areas(id),
  starts_at timestamptz,
  ends_at timestamptz,
  title text not null,
  source_url text not null,
  source_date date not null,
  unique (kind, locality, title, source_url)
);
create table if not exists supply_volumes (
  id bigint generated always as identity primary key,
  locality text not null,
  area_id bigint references areas(id),
  volume_m3 double precision not null check (volume_m3 >= 0),
  period_start date not null,
  period_end date not null,
  source_url text not null,
  unique (locality, period_start, period_end)
);

-- ---------- RLS ----------
alter table tankers enable row level security;
alter table sessions enable row level security;
alter table session_actions enable row level security;
alter table allocations enable row level security;
alter table notices enable row level security;
alter table supply_volumes enable row level security;
drop policy if exists "read all" on tankers;
drop policy if exists "read all" on allocations;
drop policy if exists "read all" on notices;
drop policy if exists "read all" on supply_volumes;
create policy "read all" on tankers for select using (true);
create policy "read all" on allocations for select using (true);
create policy "read all" on notices for select using (true);
create policy "read all" on supply_volumes for select using (true);
-- sessions / session_actions: RLS on and NO policy -> invisible to anon; revoke as a second lock.
revoke all on sessions, session_actions from anon, authenticated;

-- Realtime: driver and resident see allocations change (served / released).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'allocations') then
    alter publication supabase_realtime add table allocations;
  end if;
end $$;

-- =====================================================================================
-- Server-side write functions. Called ONLY by /api/* route handlers with the service key.
-- Each returns jsonb {ok: true, ...} or {ok: false, error: '<code>', ...}; never raises on
-- an expected refusal, so the API can map codes to HTTP statuses.
-- =====================================================================================

-- Guest limits (DEMO values, see team/p3-backend/CONTRACT-V3-PROPOSAL.md):
--   report     1 per session per street per 30 min, 10 per session per hour
--   request    1 waiting request per session per street (a repeat returns the same id), 3 open per session
--   complaint  1 per session per street per category per 6 h (a repeat returns the same id), 5 per hour
create or replace function kd_guest_report(p_session uuid, p_street bigint, p_type text)
returns jsonb language plpgsql as $$
declare v_last timestamptz; v_n int; v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('kd_session:' || p_session::text));
  if not exists (select 1 from streets where id = p_street) then
    return jsonb_build_object('ok', false, 'error', 'unknown_street');
  end if;
  if p_type is null or p_type not in ('water_on','water_off') then
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;
  select max(created_at) into v_last from session_actions
    where session_id = p_session and kind = 'report' and street_id = p_street and created_at > now() - interval '30 minutes';
  if v_last is not null then
    return jsonb_build_object('ok', false, 'error', 'throttled',
      'retry_after_s', ceil(extract(epoch from v_last + interval '30 minutes' - now()))::int);
  end if;
  select count(*) into v_n from session_actions
    where session_id = p_session and kind = 'report' and created_at > now() - interval '1 hour';
  if v_n >= 10 then
    return jsonb_build_object('ok', false, 'error', 'throttled', 'retry_after_s', 3600);
  end if;
  insert into reports (street_id, type) values (p_street, p_type) returning id into v_id;
  insert into session_actions (session_id, kind, street_id, ref_id) values (p_session, 'report', p_street, v_id);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function kd_guest_request(p_session uuid, p_street bigint, p_litres int)
returns jsonb language plpgsql as $$
declare v_id bigint; v_n int;
begin
  perform pg_advisory_xact_lock(hashtext('kd_session:' || p_session::text));
  if not exists (select 1 from streets where id = p_street) then
    return jsonb_build_object('ok', false, 'error', 'unknown_street');
  end if;
  if p_litres is null or p_litres < 1 or p_litres > 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_litres');
  end if;
  -- Repeat click / second tab: return the waiting request this session already has for the street.
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
  insert into requests (street_id, status, litres) values (p_street, 'waiting', p_litres) returning id into v_id;
  insert into session_actions (session_id, kind, street_id, ref_id) values (p_session, 'request', p_street, v_id);
  return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false);
end $$;

create or replace function kd_guest_complaint(p_session uuid, p_street bigint, p_category text)
returns jsonb language plpgsql as $$
declare v_id bigint; v_n int;
begin
  perform pg_advisory_xact_lock(hashtext('kd_session:' || p_session::text));
  if not exists (select 1 from streets where id = p_street) then
    return jsonb_build_object('ok', false, 'error', 'unknown_street');
  end if;
  if p_category is null or p_category not in ('no_water','dirty_water','tanker_no_show','other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_category');
  end if;
  select c.id into v_id from session_actions a join complaints c on c.id = a.ref_id
    where a.session_id = p_session and a.kind = 'complaint' and a.street_id = p_street
      and c.category = p_category and a.created_at > now() - interval '6 hours'
    order by c.id desc limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', true);
  end if;
  select count(*) into v_n from session_actions
    where session_id = p_session and kind = 'complaint' and created_at > now() - interval '1 hour';
  if v_n >= 5 then
    return jsonb_build_object('ok', false, 'error', 'throttled', 'retry_after_s', 3600);
  end if;
  insert into complaints (street_id, category) values (p_street, p_category) returning id into v_id;
  insert into session_actions (session_id, kind, street_id, ref_id) values (p_session, 'complaint', p_street, v_id);
  return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false);
end $$;

-- One tank-load for one tanker: fill up to its capacity from outstanding demand in street order
-- (streets.order_index, then oldest request). p_split = true: a request bigger than the space left
-- is split, the rest stays outstanding for the next load. p_split = false: it is skipped for this load.
-- One global dispatch lock: two operators can never allocate the same litres twice.
-- Same p_key twice -> the same round (double click, retry after a timeout).
-- Same rule as planDispatch() in lib/queries.ts; keep them in step.
create or replace function kd_allocate_load(p_tanker bigint, p_key text, p_split boolean default true)
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
  select capacity_litres into v_cap from tankers where id = p_tanker and active;
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
           q.litres - coalesce((select sum(a.litres) from allocations a
                                 where a.request_id = q.id and a.released_at is null), 0) as outstanding
    from requests q join streets s on s.id = q.street_id
    where q.status = 'waiting' and q.litres is not null
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

-- Driver "Start round": activate the tanker's planned round; if ops planned none, plan one load now.
create or replace function kd_start_round(p_tanker bigint)
returns jsonb language plpgsql as $$
declare v_round bigint; v_status text; v_alloc jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('kd_dispatch'));
  select id, status into v_round, v_status from rounds where tanker_id = p_tanker and status in ('planned','active');
  if v_round is null then
    v_alloc := kd_allocate_load(p_tanker, null, true);
    if not (v_alloc->>'ok')::boolean then return v_alloc; end if;
    v_round := (v_alloc->>'round_id')::bigint;
    v_status := 'planned';
  end if;
  if v_status = 'active' then
    return jsonb_build_object('ok', true, 'round_id', v_round, 'already', true);
  end if;
  update rounds set status = 'active', started_at = now() where id = v_round;
  return jsonb_build_object('ok', true, 'round_id', v_round, 'already', false);
end $$;

-- Driver "Served": only this stop's allocations are delivered; a request becomes 'served' only when
-- every litre of it was delivered. Unallocated or newly arrived requests on the street stay waiting.
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
      and q.litres <= (select coalesce(sum(a.litres), 0) from allocations a
                       where a.request_id = q.id and a.delivered_at is not null and a.released_at is null);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'already', false, 'served_requests', v_n);
end $$;

-- Driver "End round" (p_tanker = the driver's tanker) or ops cancel (p_tanker = null).
-- Undelivered litres are released and go back to pending demand.
create or replace function kd_end_round(p_tanker bigint, p_round bigint)
returns jsonb language plpgsql as $$
declare v_owner bigint; v_status text; v_released int;
begin
  select tanker_id, status into v_owner, v_status from rounds where id = p_round for update;
  if v_status is null then return jsonb_build_object('ok', false, 'error', 'unknown_round'); end if;
  if p_tanker is not null and v_owner is distinct from p_tanker then
    return jsonb_build_object('ok', false, 'error', 'not_your_round');
  end if;
  if v_status = 'done' then return jsonb_build_object('ok', true, 'already', true, 'released_litres', 0); end if;
  update rounds set status = 'done', ended_at = now() where id = p_round;
  with rel as (
    update allocations set released_at = now()
    where round_id = p_round and delivered_at is null and released_at is null returning litres
  ) select coalesce(sum(litres), 0) into v_released from rel;
  return jsonb_build_object('ok', true, 'already', false, 'released_litres', v_released);
end $$;

-- Driver GPS fix: only for the driver's own active round.
create or replace function kd_post_position(p_tanker bigint, p_round bigint, p_lat double precision, p_lng double precision)
returns jsonb language plpgsql as $$
declare v_owner bigint; v_status text;
begin
  select tanker_id, status into v_owner, v_status from rounds where id = p_round;
  if v_status is null then return jsonb_build_object('ok', false, 'error', 'unknown_round'); end if;
  if v_owner is distinct from p_tanker then return jsonb_build_object('ok', false, 'error', 'not_your_round'); end if;
  if v_status <> 'active' then return jsonb_build_object('ok', false, 'error', 'round_not_active'); end if;
  insert into truck_positions (round_id, lat, lng) values (p_round, p_lat, p_lng);
  return jsonb_build_object('ok', true);
end $$;

-- Only the service role (route handlers) may call these. Supabase grants EXECUTE on new public
-- functions to anon/authenticated by default, so revoke explicitly.
revoke all on function kd_guest_report(uuid, bigint, text) from public, anon, authenticated;
revoke all on function kd_guest_request(uuid, bigint, int) from public, anon, authenticated;
revoke all on function kd_guest_complaint(uuid, bigint, text) from public, anon, authenticated;
revoke all on function kd_allocate_load(bigint, text, boolean) from public, anon, authenticated;
revoke all on function kd_start_round(bigint) from public, anon, authenticated;
revoke all on function kd_serve_stop(bigint, bigint) from public, anon, authenticated;
revoke all on function kd_end_round(bigint, bigint) from public, anon, authenticated;
revoke all on function kd_post_position(bigint, bigint, double precision, double precision) from public, anon, authenticated;
grant execute on function kd_guest_report(uuid, bigint, text) to service_role;
grant execute on function kd_guest_request(uuid, bigint, int) to service_role;
grant execute on function kd_guest_complaint(uuid, bigint, text) to service_role;
grant execute on function kd_allocate_load(bigint, text, boolean) to service_role;
grant execute on function kd_start_round(bigint) to service_role;
grant execute on function kd_serve_stop(bigint, bigint) to service_role;
grant execute on function kd_end_round(bigint, bigint) to service_role;
grant execute on function kd_post_position(bigint, bigint, double precision, double precision) to service_role;
