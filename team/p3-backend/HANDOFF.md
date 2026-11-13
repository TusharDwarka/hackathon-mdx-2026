# HANDOFF (p3-backend)

## Changed
- `lib/queries.ts` (new): contract ops 1, 2, 3, 10, 11 on the anon Supabase client.
  - `getAreas()`, `getStreets(areaId?)` -> street picker (driving order)
  - `getTodayWindow(streetId)` -> `Window | null` (op 1; `day` matches 'Mon'..'Sun' or 'YYYY-MM-DD', times as "HH:MM")
  - `postReport(streetId, 'water_on' | 'water_off')` (op 2)
  - `postRequest(streetId)` -> new request id (op 3)
  - `getReliability(streetId, days = 7)` -> `{ onTime, days, perDay[] }` (op 10)
  - `getHoursDry(areaId?)` -> `Record<street_id, hours | null>` (op 11; null = never reported water_on)
  - All functions throw on Supabase error: wrap in try/catch and fall back to `lib/mock.ts`.
  - Types `Street`, `Window` are the same shape as `lib/mock.ts`.
- `scripts/seed-demo.ts` (new): 7 days of demo `reports` with `is_demo = true`, deterministic (same data every run),
  mix of on time / late / no water, later streets worse. Deletes old `is_demo` rows first, keeps real reports.
  Run after load-data: `node --env-file=.env.local --import tsx scripts/seed-demo.ts`

## Needs from others
- P1: Supabase project + `.env.local` keys (1b) so the queries can be run against real tables.
- P5: `data/schedule.csv` + `data/streets.csv`, then `npm run load-data`.
- P1 (optional): add `"seed-demo": "node --env-file=.env.local --import tsx scripts/seed-demo.ts"` to package.json scripts.

## Blocked
- Nothing can be tested against a real database until 1b + 1c are done.

## How to test
- `npx tsx lib/queries.ts` -> prints `queries ok` (pure date logic, no database).
- `npx tsx scripts/seed-demo.ts --dry-run` -> prints the 7-day demo reports it would insert (no database).
- With `.env.local` set: in any client component `await getTodayWindow(1)` / `await getStreets()`.
