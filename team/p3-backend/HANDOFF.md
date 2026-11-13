# HANDOFF (p3-backend)

## V3 (docs/NEXT-TASK-SPLIT.md, P3 package) — b06aef4 on feat/data
Full shapes, limits and decisions for P1: `team/p3-backend/CONTRACT-V3-PROPOSAL.md`.

### Changed
- `sql/v3.sql` is additive, so the current screens keep working. It adds tankers (2 demo rows of 1000 L), private `sessions` and `session_actions`, `requests.litres`, rounds with `tanker_id`, a 'planned' status and a `dispatch_key`, plus `allocations`, `complaints.is_demo`, reservoir `date_basis` and `is_aggregate`, `notices` and `supply_volumes`. Eight `kd_*` functions do every write with ownership and limit checks in one transaction. Only the service role may call them.
- `sql/v3-lockdown.sql` drops the anon insert and update policies. Run it ONLY after P2 and P4 write through `/api/*`.
- `app/api/*` has 10 route handlers: session, reports, requests, complaints, dispatch, rounds, status, priority, reservoirs and notices. Shared code lives in `app/api/_lib/`.
- `lib/queries.ts` changes:
  - New pure rules: `planDispatch`, `loadsNeeded`, the `validate*Input` functions, `computeStreetTrust` and `computeAllStreetTrust`, `explainPriority` and `priorityRows`, `groupComplaints`, `latestReservoirs`, `classifyNotices` and `matchArea`.
  - New client calls: `getSession`, `startGuestSession`, `startStaffSession`, `endSession`, `getMyRequests`, `getDispatchPlan`, `confirmDispatch`, `getRounds`, `roundAction`, `getTrustStatuses`, `getComplaintGroups`, `getReservoirs`, `getNotices` and `getTankers`.
  - `postReport`, `postComplaint` and `resolveComplaint` now go through the API. They fall back to the old anon write while the API is not deployed.
  - `postRequest(streetId, litres)` uses the API. Calling it without litres keeps the old anon insert, so the current Home still works.
  - `computeStreetStatus` and `computePriority` keep the V2 shape and use the same single rule.
- `scripts/load-data.ts` loads every reservoir from `reservoir_levels.csv`. It skips prior-year rows, keeps the 7-reservoir aggregate apart, and unifies the name spellings. It also loads `notices.csv` and `supply.csv` when present.
- `scripts/seed-demo.ts` replaces DEMO complaints only and no longer wipes the table.
- `scripts/test-sql.ts` runs every migration in in-memory Postgres (PGlite) and checks 42 rules.

### Needs from others
- **P1:**
  - Confirm or adjust the contract proposal, especially the guest session (decision 1 there).
  - Run `sql/v3.sql` after v2.
  - Set `DRIVER_ACCESS_CODE` and `OPS_ACCESS_CODE` on Vercel, or `KD_DEMO_ACCESS=1` to allow the labelled demo codes.
  - Make sure `SUPABASE_SERVICE_ROLE_KEY` is set on Vercel. Without it every `/api/*` route answers 503 and the screens use the legacy path.
- **P2:**
  - The "Continue as guest" button calls `startGuestSession()`.
  - The request form calls `postRequest(streetId, litres)`, from 1 to 1000 L.
  - Show request progress with `getMyRequests()`.
  - Handle the `throttled` error code: `ApiError.detail.retry_after_s` says when the next report is allowed.
- **P4:**
  - The driver signs in with `startStaffSession("driver", code, tankerId)`, then `getRounds()` shows only its own round.
  - Round actions are `roundAction({action: "start" | "serve" | "end" | "position"})`.
  - Ops signs in with `startStaffSession("ops", code)`. The dispatch preview is `getDispatchPlan({capacity: 100, tankers: 1})` for the 120 L example, and confirming is `confirmDispatch(tankerId, key)`. Reuse the same key on retry.
  - Complaint groups come from `getComplaintGroups()`. The resident map follows the right tanker with `getRounds(streetId)`.
- **P5:** add `data/notices.csv` and `data/supply.csv` in the formats in the proposal, but only with verified rows.

### Blocked
- Nothing in V3 has run against the real Supabase. There is no `.env.local` on this machine.
- The SQL is tested in PGlite, which is real Postgres 18 with Supabase roles emulated. The route handlers are type-checked, built and smoke-tested without keys. They have not run against a live PostgREST.

### How to test
- `npx tsx lib/queries.ts` prints `queries ok`. This covers capacity, split, validation, trust, priority, complaints, reservoirs and notices.
- `npm i --no-save @electric-sql/pglite && npx tsx scripts/test-sql.ts` prints `sql ok`. It covers the 120 L / 100 L case, the same key giving the same round, a busy tanker being refused, driver 2 being unable to serve driver 1's stop, a late request staying waiting, split and release, and anon being locked out.
- `npm run build` and `npm run lint` pass. Every `/api/*` route is dynamic.
- With keys, run `npm run dev`. Then in the browser console:
  1. `await startGuestSession()`
  2. `await postRequest(<street>, 200)` twice. It returns the same id.
  3. `await startStaffSession("ops", "demo-ops")`, then `await getDispatchPlan({capacity: 100, tankers: 1})`.
  4. `await confirmDispatch(1, "test-key-1")`.

## V2 and earlier

## Changed
- `lib/queries.ts`: contract ops 1, 2, 3, 10, 11 on the anon Supabase client.
  - `getAreas()`, `getStreets(areaId?)` -> street picker (driving order)
  - `getTodayWindow(streetId)` -> `Window | null` (op 1; `day` matches 'Mon'..'Sun' or 'YYYY-MM-DD', times as "HH:MM")
  - `postReport(streetId, 'water_on' | 'water_off')` (op 2)
  - `postRequest(streetId)` -> new request id (op 3)
  - `getReliability(streetId, days = 7)` -> `{ onTime, days, perDay[] }` (op 10)
  - `getHoursDry(areaId?)` -> `Record<street_id, hours | null>` (op 11; null = never reported water_on)
  - All functions throw on Supabase error: wrap in try/catch and fall back to `lib/mock.ts`.
- `scripts/seed-demo.ts`: deterministic demo data, `npm run seed-demo` (V2 step 5 included):
  - `reports` (is_demo = true): 7 past days + today, mix of on time / late / no water, later streets worse;
    plus the last 2 h: some streets confirmed "no water", some unconfirmed, some confirmed "water on",
    and ONE lone water_on on the middle street while both neighbours say water_off -> `suspect` under op 15.
  - `complaints`: 6 rows (5 open, 1 resolved) across categories. The complaints table is RESET on every seed
    (no is_demo flag in the contract): run seed-demo before the demo, not during it.
  - Deletes old `is_demo` reports first, keeps real reports. Warns (does not crash) if sql/v2.sql was not run yet.
- `sql/v2.sql` (V2 step 2): tables `complaints` and `reservoir_levels`, RLS (anon reads all, inserts complaints,
  updates complaints.status), Realtime on `complaints`. No payment or fee columns. Re-runnable.
- `scripts/load-data.ts` (V2 step 3): also upserts `data/reservoir.csv` into `reservoir_levels` when the file exists
  (key reservoir+day); prints a notice and skips when it is missing.
- `lib/queries.ts` V2 (step 4), each rule is a pure function + a Supabase call:
  - `getTodayReports(streetId)` -> `{type, created_at}[]` since local midnight (Home had this inline; same shape as `TodayReport` in DayTrack).
  - op 12 `getReservoirStatus(reservoir = "Mare aux Vacoas")` -> `{reservoir, level_pct, day, tier, source_url} | null`; `reservoirTier(pct)`: >= 60 normal, 30-60 watch, < 30 critical (DEMO thresholds, say so in the UI).
  - op 14 `postComplaint(streetId, category)` -> id; `getOpenComplaints()` -> `Complaint[]` newest first; `resolveComplaint(id)`. Categories: no_water, dirty_water, tanker_no_show, other.
  - op 15 `getStreetStatus(streetId)` / `getStreetStatuses()` -> `{status, trust, suspect, reports}` per street from the last 3 h. `computeStreetStatus(...)`:
    confirmed = >= 2 reports and >= 2/3 agree; suspect = exactly 1 report and BOTH neighbours (prev/next order_index) have a status that contradicts it (edge streets are never suspect).
  - op 16 `getLikelyWaterTime(streetId)` -> `{from, to, days_hit, days_total} | null`; `computeLikelyWaterTime(dates)`: fixed 2 h slots (00-02 ... 22-00), the slot hit on the most distinct days in the last 14; days_total = distinct days with a water_on report; null under 3 days.
  - op 17 `getPriorityList()` -> `PriorityRow[]` sorted by score desc; `computePriority(hoursDry, waiting)`: score = hours dry + 12 x waiting; action "send tanker" (waiting > 0) / "place a static tank" (dry > 48 h) / "watch". A street that never reported water scores 0 h but keeps `hours_dry: null`.

## Needs from others
- P1: run `sql/v2.sql` in the Supabase SQL editor (after `sql/schema.sql`).
- P1: `.env.local` with `SUPABASE_SERVICE_ROLE_KEY` on P3's machine, or P1 runs `npm run load-data` then `npm run seed-demo` (TASKS V2 step 9).
- P5: `data/reservoir.csv` (`reservoir,day,level_pct,source_url`) for the reservoir status (op 12).

## Blocked
- V2 step 1 (load-data + seed-demo against Supabase): no `.env.local` on P3's machine. Nothing in lib/queries.ts has run against a real database yet.

## How to test
- `npx tsx lib/queries.ts` -> prints `queries ok` (pure rules, no database).
- `npx tsx scripts/seed-demo.ts --dry-run` -> prints the demo reports + complaints it would insert, one street marked SUSPECT (no database).
- `npm run build` and `npm run lint` pass.
- With keys (P1): run `sql/v2.sql` in Supabase, then `npm run load-data` (expect "Loaded 1 areas, 21 streets, 26 schedule rows."
  and, once P5 adds data/reservoir.csv, "Loaded N reservoir_levels rows."), then `npm run seed-demo`.
- Then in the browser console of any page: `getStreetStatuses()` shows one street with `suspect: true`;
  `getPriorityList()` is sorted by score; `getOpenComplaints()` returns 5; `getReservoirStatus()` is null until reservoir.csv is loaded.
