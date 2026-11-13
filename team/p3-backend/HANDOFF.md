# HANDOFF (p3-backend)

## Changed
- `lib/queries.ts`: contract ops 1, 2, 3, 10, 11 on the anon Supabase client.
  - `getAreas()`, `getStreets(areaId?)` -> street picker (driving order)
  - `getTodayWindow(streetId)` -> `Window | null` (op 1; `day` matches 'Mon'..'Sun' or 'YYYY-MM-DD', times as "HH:MM")
  - `postReport(streetId, 'water_on' | 'water_off')` (op 2)
  - `postRequest(streetId)` -> new request id (op 3)
  - `getReliability(streetId, days = 7)` -> `{ onTime, days, perDay[] }` (op 10)
  - `getHoursDry(areaId?)` -> `Record<street_id, hours | null>` (op 11; null = never reported water_on)
  - All functions throw on Supabase error: wrap in try/catch and fall back to `lib/mock.ts`.
- `scripts/seed-demo.ts`: 7 days of demo `reports` with `is_demo = true`, deterministic, mix of on time / late / no water.
  Deletes old `is_demo` rows first, keeps real reports. `npm run seed-demo`.
- `sql/v2.sql` (V2 step 2): tables `complaints` and `reservoir_levels`, RLS (anon reads all, inserts complaints,
  updates complaints.status), Realtime on `complaints`. No payment or fee columns. Re-runnable.
- `scripts/load-data.ts` (V2 step 3): also upserts `data/reservoir.csv` into `reservoir_levels` when the file exists
  (key reservoir+day); prints a notice and skips when it is missing.

## Needs from others
- P1: run `sql/v2.sql` in the Supabase SQL editor (after `sql/schema.sql`).
- P1: `.env.local` with `SUPABASE_SERVICE_ROLE_KEY` on P3's machine, or P1 runs `npm run load-data` then `npm run seed-demo` (TASKS V2 step 9).
- P5: `data/reservoir.csv` (`reservoir,day,level_pct,source_url`) for the reservoir status (op 12).

## Blocked
- V2 step 1 (load-data + seed-demo against Supabase): no `.env.local` on P3's machine. Nothing in lib/queries.ts has run against a real database yet.

## How to test
- `npx tsx lib/queries.ts` -> prints `queries ok` (pure rules, no database).
- `npx tsx scripts/seed-demo.ts --dry-run` -> prints the demo reports it would insert (no database).
- With keys: `npm run load-data` (expect "Loaded 1 areas, 21 streets, 26 schedule rows."), then `npm run seed-demo`.
