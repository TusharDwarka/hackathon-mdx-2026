# HANDOFF (p3-backend)

## V6 (Sat 14 Nov, P3) — duplicate streets fix, feat/data
Live bug from the Sat 02:00 test: every Vacoas street exists twice (ids 1-21 and 22-42). Cause: `scripts/load-data.ts` did "delete all streets, insert all streets" and ignored the delete error. Once a report pointed at a street the delete failed silently and every street was inserted again.

### For P1 (run before the demo, in this order)
1. Run `sql/v6.sql` in the Supabase SQL editor (after v5). It merges each duplicate street into the oldest copy, re-points reports, requests, round_stops, complaints and session_actions, drops the second stop a round got for the same street, removes duplicate schedule slots, and adds unique keys on streets (area_id, name) and schedule (area_id, day, start_time, end_time). Safe to re-run.
2. `npm run load-data`. Streets are now UPSERTED on (area_id, name): no delete, no copies, coordinates and order refreshed in place. Expect "... streets (0 new, N updated, 0 ... kept)". Without v6 the loader still never duplicates (it inserts only missing streets) and tells you to run v6.
3. End the stale active Round 4 (test report item 3). Not done by v6 on purpose: it only touches duplicates.

### How to test
- `npm i --no-save @electric-sql/pglite && npx tsx scripts/test-sql.ts` prints `sql ok`. The new v6 block recreates the two-copies bug, applies v6 twice, and checks the merge, the re-pointing, one stop per street per round, the refused duplicate and the upsert.
- `npx tsc --noEmit` and `npx eslint scripts/load-data.ts scripts/test-sql.ts` pass.


## V5 (docs/SPLIT-V5.md, P3) — feat/data, commits fc3aa0d, ca917c8, 811cbc3, 709e8a5
Shapes are in `lib/queries.ts` (import types from `@/lib/queries`). Every new route answers without a database (`demo: true`).

### For P1
- Run `sql/v5.sql` once (after v3 and v4). It is safe to re-run. Then turn on Email auth and turn off "Confirm email".
- Set `ANTHROPIC_API_KEY` on Vercel. Then run the scraper once with it: `node --env-file=.env.local --import tsx scripts/scrape-notices.ts`. That stores AI readings in `notices` and in `app/api/notices/demo-notices.json`; commit that file so the demo has cached AI readings. Without the key everything works, but readings come from the rule reader (`ai_extracted: false`).
- `npm run load-data` now also loads `data/localities.csv` once P5 commits it.
- The AI call uses plain `fetch` because `package.json` is yours. Add `@anthropic-ai/sdk` if you want, and I will switch `app/api/_lib/notice-ai.ts` to it.
- **Behaviour change:** guests can no longer file complaints (`kd_guest_complaint` is closed), and anon can no longer insert complaints. P2 must ship the login before this goes live.

### For P2
- **Accounts:**
  - Functions: `signUp(email, password)`, `signIn`, `signOut`, `getUser()` and `onAuthChange(cb)`, which returns an unsubscribe.
  - Errors are `ApiError` with `code` = `invalid_credentials` | `user_already_exists` | `weak_password` (under 6) | `email_address_invalid` | `over_request_rate_limit`.
  - `validateCredentials(email, password)` checks the form first.
- **Complaints:** `postComplaint(streetId, category)` throws `ApiError` `sign_in_required` (401) for a guest, without a network call; show the login. `getMyComplaints()` lists the user's own.
- **Requests:** `postRequest(streetId)`. A second argument is ignored, so your current call still compiles; delete the litres picker.
- **Search:** `loadPlaces()` (once, ~0.5 MB), then `searchPlaces(index, query, 8)` and `placeLabel(p)` ("Street, Locality" / "Locality, District"). "lescalier", "l'escalier", "rose-belle" and "rosebelle" all work.
- **Safe to drink:** `getWaterQuality(undefined, localityName)`.
  - Returns `{level, message, reasons[], advice, advice_source_url, source_url, date, rain_mm_48h, level_pct, notice?, demo}`.
  - `reasons` ⊂ `official_notice | heavy_rain | low_reservoir`.
  - It never says "safe". `message` already reads "No official advisory found for <locality>. If the water looks cloudy or smells, boil it before drinking." when nothing is known.
  - `computeWaterQuality([], tier, now)` still works for your offline path.
- **Notices:** `getNoticeFeed(locality?)` returns `{notices: FeedNotice[], demo}`. When `ai_extracted` is true, show `AI_NOTICE_LABEL` and the `url`.

### For P4
- **Dispatch (households):** every waiting request is one household, planned at `HOUSEHOLD_L = 20` L (demo, ops-side, the same as your `ASSUMED_REQUEST_L`). `GET /api/dispatch` now returns `households` and `household_litres` instead of `requests_without_litres`. Your plan body `{key, capacity_l, loads}` is unchanged.
- **Priority:** `PriorityRow` has no `waiting_litres` any more; `waiting` = households. The reason line reads "3 households waiting for a tanker".
- **Places:** `public/places.json` (5,968 entries: 305 localities, 5,663 streets). Localities with district are in the `localities` table (`getLocalities(district?)`).
- **Rivers:** `public/rivers.geojson` (1,099 rivers and streams, 434 named). Use `loadRivers()`, then `nearestRiver(lat, lng, rivers)` → `{distance_m, name, waterway}`, or `distanceToRiverM(lat, lng, rivers)`. `NEAR_RIVER_M = 200`. It is pure: compute on the phone, never send the position.
- **Paste-a-notice box:** `parseNotice(text, url?, save)`.
  - Needs an ops session.
  - Returns `{notice: {localities, unmatched_localities, start, end, dates, kind, summary}, ai_extracted, cached, saved_id, note}`.
  - Preview with `save=false`, then Publish with `save=true`. The second call is cached, so no second AI call.

### For P5
- Commit `data/localities.csv` with its source line: run `npx tsx scripts/fetch-osm.ts` (Overpass, OSM ODbL). It also rewrites `public/places.json` and `public/rivers.geojson`.
- The safe-to-drink advice is fixed text pointing at the WHO "Boil water" brief (`WHO_BOIL_URL`). Swap in CWA or Ministry of Health text and a URL if you find one.
- The heavy-rain threshold (`HEAVY_RAIN_MM_48H = 50` mm in 48 h, Open-Meteo rainfall) is a demo value. Replace it if MMS publishes one.

### Not done
- Item 4 (supply rule per locality): `data/supply_rules.csv` is not on main yet. When P5 commits it, I wire `basis` into the forecast.
- GIS (gis.govmu.org) times out from here. The scraper tries it and skips it. News comes from defimedia and lemauricien RSS.
- Low reservoir as a reason only covers Plaines Wilhems (Mare aux Vacoas). For other districts the reservoir is unknown and is not used as a reason.

### How to test
- `npx tsx lib/queries.ts` → `queries ok`.
- `npx tsx scripts/test-sql.ts` → `sql ok`. It runs v3, v4 and v5 twice in PGlite and checks auth RLS, household dispatch, localities and notices.
- `/api/quality?locality=lescalier` → `none` with real rainfall.
- `/api/notices/feed?locality=Curepipe`.
- A guest `POST /api/complaints` → 401 `sign_in_required`.

## After merge 8 — integration with P2 and P4 (4bbce48 on feat/data, main merged in)
I read P2's and P4's merge-8 code against my API and closed the gaps on P3's side.

### For P4
- **Your dispatch Confirm now works.** `POST /api/dispatch` accepts your plan body `{key, capacity_l, loads: [{tanker, trip, deliveries}]}` and answers `{rounds: [{round_id, tanker, tanker_id, litres, duplicate, round}], deferred: [{tanker, trip, reason}]}`.
  - "Tanker A" is the first active tanker by id, "Tanker B" the second, and so on. A number means that tanker id.
  - The server does not take your litres. It allocates the real outstanding litres in street order, capped at `capacity_l` and at the tanker's own capacity. The same rule as your preview gives the same result on the same demand.
  - Trip 2 and later loads come back in `deferred` with reason `refill_trip`. They are allocated when the driver ends trip 1 and taps Start again.
  - A busy tanker or no demand also goes to `deferred`. If nothing at all is allocated, the answer is 409 `nothing_allocated`.
  - A retry with the same `key` returns the same rounds.
  - It needs an ops session (sign in on `/login`); without one the answer is 401.
- **Litres are real now.** Your preview still uses `ASSUMED_REQUEST_L = 20`. Real outstanding litres per request are in `GET /api/dispatch` (`plan.loads`, `requests_without_litres`), and per street in `GET /api/priority` (`waiting_litres`).
- **Water points table.** `water_points (name, kind, lat, lng, source_url)` is in `sql/v4.sql`, readable by anon, and loaded from `data/water_points.csv`. Your query in `components/map/data.ts` matches.
- **Trend days count from today**, the same as yours. Your self-check and my route give the same Mare aux Vacoas numbers: -0.124 % per day, 14 days to 30%, 95 days to 20%. One difference: my `projection` starts today, while yours starts at the latest reading.
- `/api/reservoirs/trend` answers `null` with 200 for a reservoir with too few recent readings. Your loader then shows "no trend", which is right.

### For P2
- My water-day functions are on main. Your stand-ins in `components/home/water-day.ts` can go.
- **`planDay(window, tasks?)`** returns `offset` now (minutes from the window start, reminder = -30), so `WaterDay.tsx` can import it unchanged. Timings match yours. The labels are shorter; if you want your wording, map `kind` and `offset` to your own text when you render.
- **`forecastNext`** is the async loader (`forecastNext(areaId, now)`). The pure rule is `computeForecast(rows, tier, likely, now)`, where `rows` are the schedule rows `{day, start_time, end_time, source_url, source_date}`. From the browser it is simplest to call `getForecast(areaId)`.
- **`waterQuality`** is the async loader; `getWaterQuality(areaId)` calls the API. The pure rule is `computeWaterQuality(notices, tier, now)`, where notices are `{title, day, category, source_url}`.
- **`districtOf("Vacoas")`** returns `"Plaines-Wilhems"`. The `DISTRICT` map in `PublicInfo.tsx` can use it, and unknown areas return null.

### Still blocked
- No `.env.local` here. Nothing has run against the real Supabase. P1 runs `sql/v3.sql` then `sql/v4.sql`, then `npm run load-data` and `npm run seed-demo`.

## Round 3 water day (docs/WATER-DAY-SPLIT.md, P3) — bb82343 on feat/data
Ops 24 to 27 are built against the shapes in the brief. All three routes answer even without a database: they fall back to the real timetable and Mare aux Vacoas readings, with `demo: true`, and the UI must label that.

### Shapes (for P2 / P4; import the types from `@/lib/queries`)
```ts
// op 24  getForecast(areaId?) -> GET /api/forecast?area_id=   (null when nothing to go on)
type Forecast = {
  next: { day: string /* YYYY-MM-DD */; start_time: string; end_time: string };
  basis: "official" | "every_second_day" | "history";
  confidence: "high" | "medium" | "low";
  tier: "normal" | "watch" | "critical" | null;
  note: string;            // "Official CWA timetable (published 10 Oct); reservoir at watch level"
  source_url: string | null;
} & { demo: boolean };

// op 25  getReservoirTrend(reservoir = "Mare aux Vacoas") -> GET /api/reservoirs/trend?reservoir=
//        getReservoirTrendsAll() -> GET /api/reservoirs/trend?reservoir=all -> { trends: Trend[]; demo }
type Trend = {
  reservoir: string; latest_pct: number; latest_day: string;
  pct_per_day: number;                                   // negative = falling
  days_to_30: number | null; days_to_20: number | null; // from today; null if rising or < 3 points
  reaches_30_on: string | null; reaches_20_on: string | null; // extra: the dates, for the chart label
  points: { day: string; level_pct: number }[];
  projection: { day: string; level_pct: number }[];     // today + 30 days
} & { demo: boolean };

// op 26  getWaterQuality(areaId?) -> GET /api/quality?area_id=
type Quality = { level: "none" | "cloudy_possible" | "official_notice"; message: string;
  notice?: { title: string; day: string; source_url: string } } & { demo: boolean };

// op 27  planDay(window, tasks?) -> { time, label, kind: "remind" | "arrive" | "task" | "end" }[]  (pure, no API)
```

### Rules
- **Forecast (op 24):**
  - The official timetable wins: the earliest window on or after tomorrow gives high confidence.
  - Otherwise, if the last 3 dated windows are 2 days apart, the forecast repeats every second day from the last official day. That is medium confidence, or low when the reservoir is critical.
  - Otherwise op 16's likely time for tomorrow gives low confidence.
  - Today `data/schedule.csv` runs to 29 Nov, so the demo shows "official".
- **Trend (op 25):** a least-squares line over readings from the last 90 days, one per day, without the aggregate. On the 7 real Mare aux Vacoas rows it gives:

  | Measure | Value |
  |---|---|
  | Slope | -0.124 % per day |
  | 30% reached | 27 Nov 2026 |
  | 20% reached | 16 Feb 2027 |

  The press says 20% by end of November, so our straight line is slower. Show ours as an estimate next to the press figure, linked through `source_url` in `data/reservoir.csv`, and do not hide the gap.
- **Quality (op 26):**
  - An official notice from the last 14 days wins, with boil before quality.
  - Otherwise a watch or critical tier gives the "may look cloudy" caution.
  - Otherwise the result is `none`.
  - The messages are fixed strings in `QUALITY_MESSAGES`, and none says safe or unsafe.
- **Planner (op 27):**
  - The reminder comes 30 min before the start, and water arrives at the start.
  - Default tasks: fill the tank at the start. Run the washing machine at start + 3 h if that is before end - 30 min. Finish laundry at end - 30 min.
  - Custom tasks are spread from the start to end - 30 min.
  - A window that crosses midnight works.
- **Server time:** the routes use `mauritiusNow()`, because Vercel runs in UTC and would get "tomorrow" wrong between 00:00 and 04:00 in Mauritius.

### Needs from others
- **P1:** add ops 24 to 27 to `contracts/api.md`. My only additions to the brief's shapes are `demo`, `reaches_30_on`, `reaches_20_on` and `?reservoir=all`. Then run `sql/v4.sql`, which adds the `quality_notices` table.
- **P5:**
  - Add `data/quality_notices.csv` with columns `area,day,title,category,source_url`. Category is `boil` or `quality`, from official notices only. An empty file is fine. An area of "island-wide" applies to every area.
  - Add more reservoir readings, at least 3 per reservoir in the last 90 days, so other reservoirs get a trend.
  - Add an area to `AREA_RESERVOIR` in `lib/queries.ts` (ask P3) if a new locality is fed by a reservoir other than Mare aux Vacoas.

### How to test
- `npx tsx lib/queries.ts` prints `queries ok`. It checks that official beats the rule, the rule lands on the right day, critical gives low, the history fallback works, the real Mare aux Vacoas slope and February date, rising gives null, the planner reminder and midnight crossing, and that no quality message claims safety.
- `npm i --no-save @electric-sql/pglite && npx tsx scripts/test-sql.ts` prints `sql ok`. v4 is applied twice, the category is checked, and anon can read but not write.
- With no keys, `npm run build && npx next start` then `curl localhost:3000/api/forecast`, `/api/quality` and `/api/reservoirs/trend` return real-data fallbacks with `demo: true`.

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
