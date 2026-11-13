-- Kot Delo? V4 (docs/WATER-DAY-SPLIT.md, P3): quality / boil notices (op 26), water points (P4 map),
-- and a capped dispatch load (P4 Dispatch panel).
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

-- ---------- water points (P4 map layer; P5 data/water_points.csv) ----------
-- Tanker stops, public standpipes, static tanks. Sourced points only: source_url is required.
create table if not exists water_points (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null,                      -- as in the source file, e.g. tanker_stop / standpipe / static_tank
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  source_url text not null,
  unique (name, kind)
);
alter table water_points enable row level security;
drop policy if exists "read all" on water_points;
create policy "read all" on water_points for select using (true);

-- ---------- capped load: ops plans with a per-load cap (e.g. the 100 L demo preview) ----------
-- Same rule as kd_allocate_load (sql/v3.sql), but the load carries at most least(tanker capacity, p_max).
-- kd_allocate_load becomes a thin wrapper (p_max = null), so there is ONE allocation rule.
-- Re-running v3.sql later restores the uncapped body of kd_allocate_load: still correct.
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

create or replace function kd_allocate_load(p_tanker bigint, p_key text, p_split boolean default true)
returns jsonb language sql as $$ select kd_allocate_load_max(p_tanker, p_key, p_split, null) $$;

revoke all on function kd_allocate_load_max(bigint, text, boolean, int) from public, anon, authenticated;
revoke all on function kd_allocate_load(bigint, text, boolean) from public, anon, authenticated;
grant execute on function kd_allocate_load_max(bigint, text, boolean, int) to service_role;
grant execute on function kd_allocate_load(bigint, text, boolean) to service_role;
