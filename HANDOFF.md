# HANDOFF (project-level) — append after every build step

Format per step: **Step N — done / changed / blocked** + 5 beginner bullets. Per-person handoffs live in `team/*/HANDOFF.md`.

## Step 0 — planning
- Done: SPEC.md, contracts/api.md, TASKS.md, README.md, docs/DECISIONS.md, docs/PLAYBOOK.md, docs/BUILD-PROMPT.md, data/README.md.
- Changed: CLAUDE.md / AGENTS.md now point to docs/BUILD-PROMPT.md and docs/PLAYBOOK.md.
- Blocked: `data/schedule.csv` and `data/streets.csv` do not exist yet; [LOCALITY] not chosen.

## Step 1 — scaffold (code part)
- Done: Next.js 16 + TypeScript + Tailwind + shadcn (button, card, select, badge), `lib/supabase.ts` (browser/anon), `lib/supabase-server.ts` (service key, server only), `sql/schema.sql` (8 tables, RLS, Realtime), `scripts/load-data.ts` (`npm run load-data`, stops if the CSVs are missing), placeholder Home page. `npm run build` passes.
- Changed: ownership in CLAUDE.md / AGENTS.md now uses real folders and branches (feat/home, feat/data, feat/driver-map, feat/data-files). Removed the old web/ and api/ folder rules.
- Blocked / by hand (P1): Supabase project + run `sql/schema.sql` + keys in `.env.local` and Vercel; Vercel deploy; the CSVs from P5.
- 5 beginner bullets:
  1. Next.js is the web framework: every folder under `app/` with a `page.tsx` becomes a URL (`app/driver/page.tsx` -> `/driver`).
  2. Tailwind is utility CSS written in `className`; shadcn gives ready-made accessible components in `components/ui/`.
  3. Supabase is the hosted Postgres database; `lib/supabase.ts` is how the browser talks to it with the public anon key.
  4. `sql/schema.sql` creates the 8 tables and the rules (RLS) that say what the anon key may read or write.
  5. `scripts/load-data.ts` reads the real CSVs and fills the database; the service key it uses must never reach the browser.

## Step 5 — /driver wired to Supabase (P4)
- Done: Start round (ops 4), position every 5 s + Wake Lock (op 5), Served (op 6), End round (op 7). `components/map/data.ts` shared reads. Demo fallbacks: no requests -> all streets; no GPS -> simulated drive; no DB -> demo mode banner.
- Changed: `app/driver/page.tsx`, `components/map/data.ts`, `team/p4-ai/*`.
- Blocked: real-phone GPS test needs the Vercel https URL; Home must insert `requests` for the stop list to be real. Details in `team/p4-ai/HANDOFF.md`.
- 5 beginner bullets:
  1. `navigator.geolocation.watchPosition` asks the phone for its GPS position and calls us every time it changes; we keep only the latest fix.
  2. A `setInterval` every 5 s inserts that latest fix into `truck_positions` with the round id. Only while a round is active, so nobody is tracked outside a round.
  3. The Wake Lock API (`navigator.wakeLock.request("screen")`) keeps the phone screen on so the browser keeps sending GPS; we re-ask for it when the tab comes back to the front.
  4. Start round = one row in `rounds` + one row per street in `round_stops`, in `streets.order_index` order, built from the streets that have `waiting` requests.
  5. Served writes `served_at` on the stop and flips that street's requests to `served`; End round writes `status = done` and the React effect cleanup stops GPS and releases the lock.

## Step 6 — /map live via Supabase Realtime (P4)
- Done: truck marker moves on `truck_positions` inserts (op 8), "N stops away, about X min" from `lib/eta.ts` with the 2-minute stale rule (op 9), Served status flips live, new or ended rounds reload. Demo fallback: simulated truck when the DB is unreachable.
- Changed: `app/map/page.tsx`, `components/map/TruckMap.tsx`, `team/p4-ai/*`.
- Blocked: real two-phone test needs Supabase keys + Vercel URL. Home should link to `/map?street=<id>`.
- 5 beginner bullets:
  1. Supabase Realtime pushes database changes to the browser over a websocket, so the map never polls; `supabase.channel(...).on("postgres_changes", ...)` is the subscription.
  2. Each new `truck_positions` row for the active round calls `setFix`, React re-renders, and the Leaflet marker's `setLatLng` moves the 🚚.
  3. "Stops away" = my stop plus every unserved stop before it in `stop_order`; 1 means I am next, 0 means served.
  4. ETA = distance at 20 km/h from the truck to the next stop + 10 min per stop before mine. If the last fix is older than 2 min the map shows stops × 10 min and says the signal was lost.
  5. Leaflet needs `window`, so it is imported inside a `useEffect` (never at the top of the file), otherwise the server-side build breaks.

## Merge 1 — Fri 16:10 (P1)
- Done: PR #1 feat/data, #2 feat/home, #3 feat/driver-map merged into main (9ed0071), no conflicts. On the merged code `npm run build`, `npm run lint`, `npx tsx lib/queries.ts`, `npx tsx lib/eta.ts` and `npx tsx scripts/seed-demo.ts --dry-run` all pass. Vercel deployed it.
- Changed (P1): `package.json` has `npm run seed-demo` (asked by P3). TASKS.md ticked.
- State of the live URL (checked Fri 16:20): Supabase is reachable and the 8 tables exist, but every table is EMPTY. So Home's taps save nothing (street ids 1-5 from `lib/mock.ts` do not exist in `streets`), /driver offers "Start round · 0 stops" and /map says "No tanker round right now". The demo-mode fallbacks only start when Supabase is unreachable, not when it is empty.
- Left, in order:
  1. P5 -> P1: `data/streets.csv` + `data/schedule.csv` (still THE blocker). Then `npm run load-data` and `npm run seed-demo`.
  2. P2: swap Home from `lib/mock.ts` and `fakeReliability()` to `lib/queries.ts` (`getStreets`, `getTodayWindow`, `getReliability`, `getHoursDry`). `Window.source_url` can be null there.
  3. P4: in `app/map/page.tsx` set `STREET_KEY = "kotdelo.street"`, the key Home writes. Today the two screens use different keys, so the map does not know the resident's street. P1 decision: Home's key wins.
  4. P4: when `streets` is empty, show the same demo mode as when Supabase is unreachable (/map and /driver).
  5. P3 (small): `seed-demo` writes nothing for today, so on demo day every street is about a day dry and the heat map has no green. Add a few `water_on` rows for today.
  6. All: two-phone test on the Vercel URL (GPS needs https). Nothing has run against real rows yet.
- Not done: P4 reported that `next dev` rewrites AGENTS.md. `next build` did not touch it, so `next.config.ts` is unchanged until someone sees it again.

## Merge 2 — Fri 16:53 (P1)
- Done: PR #5 feat/data-files merged into main (772f4e6). Real data is in the repo: `data/schedule.csv` (Vacoas, every second day from 10 Oct 2026, 03:00–08:00, 26 rows) and `data/streets.csv` (21 OpenStreetMap streets in La Caverne). Checked: columns match `scripts/load-data.ts`, one area in both files, `order_index` 1..21, dates two days apart, times match the CWA communiqué copy in `data/sources/`, both source links open.
- Changed (P1): decision #8 (locality) logged in `docs/DECISIONS.md`. TASKS.md: data blocker ticked.
- The database is still EMPTY: the files are merged, not loaded.
- Left, in order (items 2 to 6 of Merge 1 are still open too):
  1. P1 or P3 (needs `.env.local`): `git pull origin main`, `npm run load-data` (expect "Loaded 1 areas, 21 streets, 26 schedule rows."), then `npm run seed-demo`.
  2. P2: demo day (Sat 14 Nov) is NOT a water day for Vacoas (windows are 13 and 15 Nov). `getTodayWindow()` returns null then, so Home needs a "no supply today" state, not an empty card.
  3. P2: `getReliability()` only counts days that have a window, so with every-second-day supply it reads "on time X of 3" or "of 4", not "of 7".

## Merge 3 — Fri 16:56 (P1)
- Done: PR #7 feat/home merged into main (a75ec2f). Home reads streets, today's window, reliability and hours dry through `lib/queries.ts`; adds the 24 h day track, the step 8 heat map, loading and empty states (including "no supply today"), failed-save messages, the `/map?street=<id>` link and the water-blue design pass. On the merged code `npm run build`, `npm run lint` and `npx tsx components/home/time.ts` pass.
- Closed by this merge: Merge 1 item 2 (Home on real queries), Merge 2 items 2 and 3 (no-window state, reliability wording), and the Home half of the street-key problem (Home now links to `/map?street=<id>`, which the map reads).
- Build steps 2 to 8 are all merged. **STOP after step 8: no extras until P1 says so.**
- The database is still EMPTY, so the live Home shows the amber "Demo mode" banner on mock streets.
- Left, in order:
  1. P1 or P3 (needs `.env.local`): `git pull origin main`, `npm run load-data`, `npm run seed-demo`. This is the only thing between the team and a real end-to-end run.
  2. P4: demo mode on /map and /driver when `streets` is empty (Home already does it). `STREET_KEY = "kotdelo.street"` is now only a nice-to-have.
  3. P3 (small): seed a few `water_on` rows for today, or the heat map has no green and the day track is empty.
  4. P2 (small): Home gives up on the database after 4 s and stays in demo mode until a reload. On venue wifi that can show "Demo mode" in front of the judges. A longer wait or a retry would be safer.
  5. All: two-phone test on the Vercel URL once the data is loaded.

## Merge 4 — Fri 17:46 (P1)
- Done: PR #12 feat/data, #13 feat/data-files, #14 feat/driver-map and #15 feat/home merged into main (4ea6b92). On the merged code `npm run build` passes (routes: `/`, `/resident`, `/driver`, `/map`, `/ops`) and the self-checks `npx tsx lib/eta.ts` and `npx tsx lib/queries.ts` pass. Not checked: the pages in a browser, and anything against the database.
- What came in: V2 queries for ops 12, 14, 15, 16, 17 and `getTodayReports`, reservoir load in `load-data`, seed rows for today with complaints and one suspect report (#12); `data/reservoir.csv`, README for V2, water-use notices, what-after slide (#13); demo mode on /map and /driver when `streets` is empty, `kotdelo.street` key, links to `/resident` (#14); landing at `/`, Home at `/resident`, shared nav, trust status, likely water time, two-tap complaint, 30 minute report limit (#15).
- V2 steps 10, 11, 13, 14, 15, 16 are merged. Closed from Merge 3: items 2 (demo mode on /map and /driver) and 3 (seed rows for today).
- Left, in order:
  1. P1: run `sql/v2.sql` in Supabase, then `npm run load-data` and `npm run seed-demo` (step 9). Still the only thing between the team and a real run.
  2. P4 + P5: #14 added four CSVs under `data/` (P5's folder). `data/reservoir_levels.csv` (P4) and `data/reservoir.csv` (P5) both hold reservoir levels; `load-data` reads `reservoir.csv`. Agree on one, and list the sources of the other three in `data/README.md` or remove them.
  3. P2: step 12 asked for three design directions; one was built. P1 to confirm it is the one.
  4. All: two-phone run on the Vercel URL (step 17), then polish only.

## Sat 14 Nov — hierarchy, road snapping, mobile fixes (P1 session, STOPPED MID-WAY: read the TODO)
State: all of this is UNCOMMITTED in the `release` worktree. The merge of P4's pitch deck (origin/feat/driver-map -> release, commit 124f6ce) is committed locally but NOT pushed.

### Done (builds: `npx next build` passes, `npx tsc --noEmit` clean, self-checks `npx tsx components/map/road.ts` and `components/ops/dispatch.ts` pass)
- Hierarchy: a driver no longer builds a round from requests. Ops Dispatch = pick streets -> pick ONE free tanker -> Send. New server step `assignStreets` in `app/api/dispatch/route.ts` (POST `{tanker_id, dispatch_key, street_ids}`) creates a `planned` round with only the picked streets. `/driver` (rewritten) shows only the signed-in tanker's round ("Sent by CWA"), Start/Served/End/position all go through `/api/rounds`. No driver session -> "Sign in as a tanker driver".
- `components/map/data.ts` `loadActiveRounds` now returns planned + active rounds, labelled with the tanker name, with `tanker_id`. `/map` says "CWA assigned X to your street. It has not left yet" for a planned round.
- Road: new `components/map/road.ts` (public OSRM server). Real GPS fixes are snapped to the nearest road (max 60 m, else left alone); the simulated drive and the demo tankers on `/map` follow the driving route instead of a straight line. Any OSRM failure falls back to the raw point.
- Mobile: `/resident` was 1,565 px wide on a 390 px phone after picking a locality (a chip strip stretched the page grid). Fixed with `grid-cols-1` on every single-column page grid (Resident, DrinkingWater, PublicInfo, ops panels, driver). Ops Overview tile now reads "Households waiting / 6" (was "6 households" overflowing its square). Dispatch rebuilt for phones, with a "Cancel round" button per tanker.
- Database reset: rounds, round_stops, truck_positions, allocations emptied (old self-started rounds, one had 379 stops). Requests kept: 6 waiting, 6 served.

### Verified on a 390 px screen against the production build
- `/resident` all 5 tabs: no sideways scroll. `/ops` Overview and Dispatch: no sideways scroll.
- Ops sent 2 picked streets to Demo tanker 1 -> planned round with exactly those 2 stops, 40 L. Demo tanker 2's driver saw "No round assigned yet". Tanker 1's driver started it (round went `active`, positions were saved).

### TODO for whoever continues
1. NOT verified yet: that the saved positions really sit on the road (the check was cut short), Served flipping the resident's request to served, End round, Cancel round, and `/map` with a live round. Run the wow path once on two phones on the Vercel URL.
2. The local dev server on port 3005 does not pick up new Tailwind classes (`grid-cols-1`): restart it before judging layout locally. The production build is fine.
3. Commit (style: `ops: staff assign streets to a tanker, driver only sees its round`, `map: keep the truck on the road`, `home: no sideways scroll on phones`), push `release`, open the PR into `main`, check the Vercel deploy.
4. On Vercel, staff sign-in needs `DRIVER_ACCESS_CODE` / `OPS_ACCESS_CODE` (or `KD_DEMO_ACCESS=1` for the demo codes). Check they are set.
5. `docs/` test checklist and Guide text still say the driver taps "Start round" right after login. New flow: resident requests -> ops Dispatch sends to a tanker -> driver taps Start. Update the pitch script too.
6. Known limits to say out loud if asked: `assignStreets` is plain inserts, not one SQL transaction (two dispatchers in the same second could double-allocate); OSRM is a public demo server (about 1 request a second); new UI strings are English only (no FR/KR entries).
7. Delete the stray `bash.exe.stackdump` in the repo root (untracked).
