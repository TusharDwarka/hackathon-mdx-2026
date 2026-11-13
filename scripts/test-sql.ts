// Runs sql/schema.sql + v2.sql + v3.sql (twice: re-run safety) + v3-lockdown.sql + v4 + v5 in an in-memory
// Postgres (PGlite, no Supabase needed) and checks the V3 rules: guest limits, capacity allocation,
// split delivery, idempotent dispatch/serve, driver ownership, release on end, anon permissions.
//
// PGlite is NOT a project dependency (package.json is P1's). Run:
//   npm i --no-save @electric-sql/pglite && npx tsx scripts/test-sql.ts
// Limitation: PGlite is one connection, so the advisory locks are not exercised by real
// concurrent sessions here; the rules they protect (no double allocation) are.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let failures = 0;
function check(cond: boolean, msg: string) {
  if (cond) console.log(`  ok  ${msg}`);
  else { failures++; console.error(`  FAIL ${msg}`); }
}
type J = Record<string, unknown> & { ok: boolean; error?: string };
async function fn(sql: string, params: unknown[] = []): Promise<J> {
  const r = await db.query<{ j: J }>(`select ${sql} as j`, params);
  return r.rows[0].j;
}
async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
async function fails(sql: string): Promise<string | null> {
  try { await db.exec(sql); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

async function main() {
  // Supabase environment: roles, default grants, realtime publication.
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create publication supabase_realtime;
  `);
  for (const f of ["sql/schema.sql", "sql/v2.sql", "sql/v3.sql", "sql/v3.sql", "sql/v3-lockdown.sql", "sql/v4.sql", "sql/v4.sql"]) {
    await db.exec(readFileSync(f, "utf8"));
  }
  console.log("migrations applied (v3 and v4 twice)");

  await db.exec(`
    insert into areas (name) values ('Vacoas');
    insert into streets (area_id, name, lat, lng, order_index)
      select 1, 'Street ' || i, -20.3, 57.48, i from generate_series(1, 6) i;
    insert into sessions (id, token_hash, role, expires_at) values
      ('00000000-0000-0000-0000-00000000000a', 'h1', 'guest', now() + interval '1 day'),
      ('00000000-0000-0000-0000-00000000000b', 'h2', 'guest', now() + interval '1 day'),
      ('00000000-0000-0000-0000-00000000000c', 'h3', 'guest', now() + interval '1 day');
  `);
  const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c";
  const tankers = (await db.query<{ id: number }>("select id from tankers order by id")).rows.map((r) => r.id);
  check(tankers.length === 2, "two demo tankers seeded once (v3 ran twice)");
  await db.exec("update tankers set capacity_litres = 100"); // the 6 x 20 L / 100 L example
  const [T1, T2] = tankers;

  console.log("guest request validation + limits");
  check((await fn("kd_guest_request($1, 1, 0)", [A])).error === "invalid_litres", "0 L rejected");
  check((await fn("kd_guest_request($1, 1, 1001)", [A])).error === "invalid_litres", "1001 L rejected");
  check((await fn("kd_guest_request($1, 99, 20)", [A])).error === "unknown_street", "unknown street rejected");
  const r1 = await fn("kd_guest_request($1, 1, 20)", [A]);
  const r1b = await fn("kd_guest_request($1, 1, 20)", [A]);
  check(r1.ok && r1b.ok && r1b.id === r1.id && r1b.duplicate === true, "repeat click returns the same request");
  await fn("kd_guest_request($1, 2, 20)", [A]);
  await fn("kd_guest_request($1, 3, 20)", [A]);
  check((await fn("kd_guest_request($1, 4, 20)", [A])).error === "too_many_open_requests", "4th open request refused");
  // Session B: three more 20 L places -> 6 x 20 L = 120 L in total.
  for (const s of [4, 5, 6]) await fn(`kd_guest_request($1, ${s}, 20)`, [B]);
  check((await one<{ n: number }>("select count(*)::int n from requests where status = 'waiting'")).n === 6, "6 waiting requests");

  console.log("guest report + complaint limits");
  check((await fn("kd_guest_report($1, 1, 'water_on')", [A])).ok, "first report accepted");
  const rep2 = await fn("kd_guest_report($1, 1, 'water_off')", [A]);
  check(rep2.error === "throttled" && Number(rep2.retry_after_s) > 0, "second report on same street within 30 min throttled");
  check((await fn("kd_guest_report($1, 1, 'bogus')", [B])).error === "invalid_type", "bad report type rejected");
  const c1 = await fn("kd_guest_complaint($1, 1, 'no_water')", [A]);
  const c2 = await fn("kd_guest_complaint($1, 1, 'no_water')", [A]);
  check(c1.ok && c2.id === c1.id && c2.duplicate === true, "repeat complaint returns the same id");

  console.log("capacity: 120 L at 100 L per load");
  const L1 = await fn("kd_allocate_load($1, 'ops-key-1', true)", [T1]);
  check(L1.ok && L1.litres === 100 && L1.stops === 5, "load 1: 100 L over 5 stops");
  const L1dup = await fn("kd_allocate_load($1, 'ops-key-1', true)", [T1]);
  check(L1dup.ok && L1dup.round_id === L1.round_id && L1dup.duplicate === true, "same dispatch key -> same round (no double allocation)");
  check((await fn("kd_allocate_load($1, 'ops-key-2', true)", [T1])).error === "tanker_busy", "tanker with an open load refused");
  const L2 = await fn("kd_allocate_load($1, 'ops-key-3', true)", [T2]);
  check(L2.ok && L2.litres === 20 && L2.stops === 1, "load 2 (second tanker): the remaining 20 L");
  check((await one<{ s: number }>("select sum(litres)::int s from allocations where released_at is null")).s === 120, "exactly 120 L allocated, never more");

  console.log("driver ownership + serving");
  check((await fn("kd_serve_stop($1, (select id from round_stops where round_id = $2 order by stop_order limit 1))", [T1, L1.round_id])).error === "round_not_active", "cannot serve before start");
  check((await fn("kd_start_round($1)", [T1])).ok, "driver 1 starts its planned round");
  check((await fn("kd_start_round($1)", [T1])).already === true, "start again is a no-op");
  const stop1 = (await one<{ id: number }>("select id from round_stops where round_id = $1 order by stop_order limit 1", [L1.round_id])).id;
  check((await fn("kd_serve_stop($1, $2)", [T2, stop1])).error === "not_your_round", "driver 2 cannot serve driver 1's stop");
  check((await fn("kd_post_position($1, $2, -20.3, 57.48)", [T2, L1.round_id])).error === "not_your_round", "driver 2 cannot post driver 1's position");
  check((await fn("kd_post_position($1, $2, -20.3, 57.48)", [T1, L1.round_id])).ok, "driver 1 posts its position");
  // A new request arrives on street 1 after allocation: serving street 1 must not serve it.
  const late = await fn("kd_guest_request($1, 1, 50)", [C]);
  const s1 = await fn("kd_serve_stop($1, $2)", [T1, stop1]);
  check(s1.ok && s1.served_requests === 1, "serving stop 1 serves exactly its allocated request");
  check((await fn("kd_serve_stop($1, $2)", [T1, stop1])).already === true, "serving twice is a no-op");
  check((await one<{ status: string }>("select status from requests where id = $1", [late.id])).status === "waiting", "late request on the same street stays waiting");

  console.log("split delivery");
  await db.exec("update rounds set status = 'done' where status in ('planned','active')"); // clear the board
  await db.exec("update allocations set released_at = now() where delivered_at is null");
  await db.exec("update requests set status = 'served' where id <> " + Number(late.id));
  await db.exec(`update requests set litres = 150 where id = ${Number(late.id)}`); // bigger than one load
  const S1 = await fn("kd_allocate_load($1, null, true)", [T1]);
  check(S1.ok && S1.litres === 100, "150 L request: first load carries 100 L");
  const S2 = await fn("kd_allocate_load($1, null, true)", [T2]);
  check(S2.ok && S2.litres === 50, "second load carries the remaining 50 L");
  const N1 = await fn("kd_allocate_load($1, null, false)", [T2]);
  check(N1.error === "tanker_busy", "busy tanker still refused");
  await fn("kd_start_round($1)", [T1]);
  const sp1 = (await one<{ id: number }>("select id from round_stops where round_id = $1", [S1.round_id])).id;
  await fn("kd_serve_stop($1, $2)", [T1, sp1]);
  check((await one<{ status: string }>("select status from requests where id = $1", [late.id])).status === "waiting", "half-delivered request stays waiting");
  const end2 = await fn("kd_end_round($1, $2)", [T2, S2.round_id]);
  check(end2.ok && end2.released_litres === 50, "ending an undelivered load releases its 50 L");
  const out = await one<{ o: number }>(
    "select (q.litres - coalesce(sum(a.litres) filter (where a.released_at is null), 0))::int o from requests q left join allocations a on a.request_id = q.id where q.id = $1 group by q.litres",
    [late.id]
  );
  check(out.o === 50, "released litres are outstanding again");
  check((await fn("kd_end_round($1, $2)", [T1, S2.round_id])).error === "not_your_round", "driver 1 cannot end driver 2's round");
  const noSplit = await fn("kd_allocate_load($1, null, false)", [T2]);
  check(noSplit.ok && noSplit.litres === 50, "no-split load takes the 50 L that fit");

  console.log("quality notices (v4)");
  check((await fails("insert into quality_notices (area, day, title, category, source_url) values ('Vacoas', '2026-11-12', 'x', 'safe', 'u')")) !== null, "category other than boil/quality rejected");
  await db.exec("insert into quality_notices (area, area_id, day, title, category, source_url) values ('Vacoas', 1, '2026-11-12', 'Boil water notice', 'boil', 'https://cwa')");
  check((await fails("insert into quality_notices (area, day, title, category, source_url) values ('Vacoas', '2026-11-12', 'Boil water notice', 'boil', 'https://cwa')")) !== null, "duplicate notice rejected (upsert key)");

  console.log("capped load + water points (v4)");
  await db.exec("update rounds set status = 'done' where status in ('planned','active')");
  await db.exec("update allocations set released_at = now() where delivered_at is null");
  await db.exec("update tankers set capacity_litres = 1000");
  const capReq = await fn("kd_guest_request($1, 3, 300)", [C]);
  check(capReq.ok, "new 300 L request");
  const capped = await fn("kd_allocate_load_max($1, 'plan-key:Tanker A', true, 100)", [T1]);
  check(capped.ok && capped.litres === 100 && capped.capacity_litres === 100, "cap 100 L on a 1000 L tanker -> load of 100 L");
  check((await fn("kd_allocate_load_max($1, 'plan-key:Tanker A', true, 100)", [T1])).duplicate === true, "same plan key -> same round");
  check((await fn("kd_allocate_load_max($1, null, true, 0)", [T2])).error === "invalid_capacity", "cap 0 rejected");
  const uncapped = await fn("kd_allocate_load($1, null, true)", [T2]);
  check(uncapped.ok && uncapped.capacity_litres === 1000, "wrapper kd_allocate_load = no cap");
  check((await fails("insert into water_points (name, kind, lat, lng) values ('x', 'standpipe', -20.3, 57.5)")) !== null, "water point without source rejected");
  check((await fails("insert into water_points (name, kind, lat, lng, source_url) values ('x', 'standpipe', -95, 57.5, 'u')")) !== null, "water point with bad latitude rejected");
  await db.exec("insert into water_points (name, kind, lat, lng, source_url) values ('Vacoas static tank', 'static_tank', -20.30, 57.48, 'https://cwa')");

  console.log("permissions (Supabase roles)");
  await db.exec("set role anon");
  check((await fails("select kd_allocate_load(1, null, true)"))?.includes("permission denied") ?? false, "anon cannot call kd_allocate_load");
  check((await fails("select kd_guest_report('" + A + "', 1, 'water_on')"))?.includes("permission denied") ?? false, "anon cannot call kd_guest_report");
  check((await fails("select * from sessions"))?.includes("permission denied") ?? false, "anon cannot read sessions");
  check((await fails("select * from session_actions"))?.includes("permission denied") ?? false, "anon cannot read session_actions");
  check((await fails("insert into reports (street_id, type) values (1, 'water_on')")) !== null, "anon cannot insert reports after lockdown");
  check((await fails("insert into rounds default values")) !== null, "anon cannot create rounds after lockdown");
  check((await db.query("update requests set status = 'served' returning id")).rows.length === 0, "anon update of requests touches no rows");
  check((await db.query("select id from allocations")).rows.length > 0, "anon can still read allocations");
  check((await db.query("select id from quality_notices")).rows.length === 1, "anon can read quality notices");
  check((await db.query("select id from water_points")).rows.length === 1, "anon can read water points");
  check((await fails("select kd_allocate_load_max(1, null, true, 100)"))?.includes("permission denied") ?? false, "anon cannot call kd_allocate_load_max");
  check((await fails("insert into quality_notices (area, day, title, category, source_url) values ('X', '2026-11-12', 't', 'boil', 'u')")) !== null, "anon cannot write quality notices");
  await db.exec("reset role");
  await db.exec("set role service_role");
  check((await fn("kd_guest_report($1, 2, 'water_off')", [B])).ok, "service role can call the functions");
  await db.exec("reset role");

  console.log("V5: accounts + requests without litres");
  // Supabase Auth stand-in: auth.users + auth.uid() from the request JWT claim.
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
    grant usage on schema auth to anon, authenticated, service_role;
    insert into auth.users values ('00000000-0000-0000-0000-0000000000f1'::uuid), ('00000000-0000-0000-0000-0000000000f2'::uuid);
  `);
  for (const f of ["sql/v5.sql", "sql/v5.sql"]) await db.exec(readFileSync(f, "utf8"));
  const U1 = "00000000-0000-0000-0000-0000000000f1", U2 = "00000000-0000-0000-0000-0000000000f2";
  check((await fn("kd_user_complaint(null, 1, 'no_water')")).error === "sign_in_required", "complaint without a user refused");
  const uc1 = await fn("kd_user_complaint($1, 1, 'no_water')", [U1]);
  const uc2 = await fn("kd_user_complaint($1, 1, 'no_water')", [U1]);
  check(uc1.ok && uc2.id === uc1.id && uc2.duplicate === true, "signed-in complaint; repeat returns the same id");
  check((await one<{ u: string }>("select user_id::text u from complaints where id = $1", [uc1.id])).u === U1, "complaint stores the user id");
  for (const c of ["dirty_water", "tanker_no_show", "other"]) await fn(`kd_user_complaint($1, 2, '${c}')`, [U1]);
  await fn("kd_user_complaint($1, 3, 'no_water')", [U1]);
  check((await fn("kd_user_complaint($1, 4, 'no_water')", [U1])).error === "throttled", "6th complaint in an hour throttled");
  check((await fn("kd_user_complaint($1, 4, 'no_water')", [U2])).ok, "another user is not throttled");
  await db.exec("set role service_role");
  check((await fails("select kd_guest_complaint('" + A + "', 1, 'no_water')"))?.includes("permission denied") ?? false, "guest complaint function closed");
  await db.exec("reset role");

  await db.exec("set role anon");
  check((await fails("select user_id from complaints"))?.includes("permission denied") ?? false, "anon cannot read complaints.user_id");
  check((await db.query("select id, category from complaints")).rows.length > 0, "anon still reads complaints without user_id (ops)");
  check((await fails("insert into complaints (street_id, category) values (1, 'other')")) !== null, "anon cannot insert complaints");
  check((await fails("select kd_user_complaint('" + U1 + "', 1, 'other')"))?.includes("permission denied") ?? false, "anon cannot call kd_user_complaint");
  await db.exec("reset role");
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${U2}'`);
  const own = (await db.query<{ user_id: string }>("select user_id::text from complaints")).rows;
  check(own.length === 1 && own[0].user_id === U2, "a signed-in user reads only their own complaints");
  check((await fails("insert into complaints (street_id, category, user_id) values (1, 'other', '" + U1 + "')")) !== null, "cannot file a complaint as someone else");
  check((await fails("insert into complaints (street_id, category, user_id) values (1, 'other', '" + U2 + "')")) === null, "can file as self (RLS)");
  await db.exec("reset role; reset request.jwt.claim.sub");

  await db.exec("update rounds set status = 'done' where status in ('planned','active')");
  await db.exec("update allocations set released_at = now() where delivered_at is null");
  await db.exec("update requests set status = 'served'");
  await db.exec("update tankers set capacity_litres = 100");
  const D = "00000000-0000-0000-0000-00000000000d";
  await db.exec(`insert into sessions (id, token_hash, role, expires_at) values ('${D}', 'h4', 'guest', now() + interval '1 day')`);
  const nl = await fn("kd_guest_request($1, 1, 5000)", [D]);
  check(nl.ok && (await one<{ l: number | null }>("select litres l from requests where id = $1", [nl.id])).l === null, "request stores no litres (5000 from the client ignored)");
  await fn("kd_guest_request($1, 2, null)", [D]);
  await fn("kd_guest_request($1, 3, null)", [D]);
  check((await one<{ n: number }>("select count(*)::int n from requests where status = 'waiting'")).n === 3, "3 households waiting");
  const H1 = await fn("kd_allocate_load_max($1, 'v5-key', true, 50)", [T1]);
  check(H1.ok && H1.litres === 50 && H1.stops === 3, "households planned at 20 L each: 50 L cap covers 2.5 households over 3 stops");
  const H2 = await fn("kd_allocate_load($1, 'v5-key-2', true)", [T2]);
  check(H2.ok && H2.litres === 10 && H2.stops === 1, "the half household left goes on the next load");
  await fn("kd_start_round($1)", [T1]);
  const hs = (await db.query<{ id: number }>("select id from round_stops where round_id = $1 order by stop_order", [H1.round_id])).rows;
  check((await fn("kd_serve_stop($1, $2)", [T1, hs[0].id])).served_requests === 1, "a fully delivered household is served");
  check((await fn("kd_serve_stop($1, $2)", [T1, hs[2].id])).served_requests === 0, "a half-delivered household stays waiting");

  await db.exec("insert into localities (name, kind, district, lat, lng, source) values ('Chamarel', 'village', 'Black River', -20.42, 57.39, 'OSM')");
  check((await fails("insert into localities (name, kind, district, lat, lng, source) values ('Chamarel', 'village', 'Black River', -20.42, 57.39, 'OSM')")) !== null, "locality unique per district (upsert key)");
  await db.exec("set role anon");
  check((await db.query("select name from localities")).rows.length === 1, "anon reads localities");
  check((await fails("insert into localities (name, kind, district, lat, lng, source) values ('X', 'village', 'Moka', -20.2, 57.5, 'OSM')")) !== null, "anon cannot write localities");
  await db.exec("reset role");

  if (failures) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nsql ok");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
