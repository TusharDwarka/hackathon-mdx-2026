# TODO (p3-backend) — data, queries, seed
Branch: feat/data. Own: sql/, scripts/, lib/queries.ts, app/api/*. Contract: contracts/api.md (only P1 edits it).

- [ ] Review sql/schema.sql with P1; confirm the RLS policies are enough for the demo path
- [x] lib/queries.ts: today's window for a street's area (op 1), insert report (2), insert request (3)
- [x] lib/queries.ts: reliability per street (op 10) and hours since last water_on per street (op 11)
- [x] scripts/seed-demo.ts: 7 days of demo reports with is_demo = true, realistic and varied (some on time, some late)
- [ ] Make sure `npm run load-data` works once P5's CSVs are in data/ (code ready; needs .env.local on P3's machine or P1 runs it)
- [ ] Never store anything by house or person

## V2 (TASKS.md step 10)
- [x] sql/v2.sql: complaints + reservoir_levels, RLS, Realtime
- [x] scripts/load-data.ts: optional data/reservoir.csv -> reservoir_levels
- [x] lib/queries.ts: ops 12, 14, 15, 16, 17 (pure rule + Supabase call each) + getTodayReports, self-check extended
- [x] scripts/seed-demo.ts: today's rows, complaints, one lone contradicting report
- [ ] Step 1 (load-data + seed-demo against Supabase): blocked, no .env.local here

## V3 (docs/NEXT-TASK-SPLIT.md, P3 package) — built on feat/data, contract proposal in CONTRACT-V3-PROPOSAL.md
- [x] 1. Sessions + write access: guest / driver / ops, limits enforced in SQL functions + API, lockdown file for RLS
- [x] 2. Tanker planning: request litres, tankers.capacity_litres, allocations, idempotent dispatch + serve
- [x] 3. Loads vs trucks: plan returns loads, tankers for one departure, refill trips, unmet litres, assumptions
- [x] 4. Street-order allocation with explicit split policy; serving never touches unallocated requests
- [x] 5. Report trust: confidence + reason codes, independent sources = sessions, raw reports kept
- [x] 6. One shared status / priority rule (lib/queries.ts) + /api/status, /api/priority with litres and reasons
- [x] 7. All reservoirs (current/stale/missing), notices + advisories, supply m3, complaint groups (loaders ready)
- [ ] P1 confirms the contract proposal; runs sql/v3.sql; sets DRIVER_ACCESS_CODE / OPS_ACCESS_CODE on Vercel
- [ ] Run against real Supabase (needs .env.local): load-data, seed-demo, then the API checks in HANDOFF
- [ ] sql/v3-lockdown.sql once P2 + P4 write through /api/*

## Round 3 water day (docs/WATER-DAY-SPLIT.md, P3)
- [x] 1. forecastNext (op 24): official > every second day > history, with confidence + tier note
- [x] 2. reservoirTrend (op 25): least squares, 30-day projection, days to 30% / 20%, every reservoir
- [x] 3. waterQuality (op 26): official notice > cloudy caution on low tier > none, fixed strings (sql/v4.sql quality_notices)
- [x] 4. planDay (op 27): reminder, tasks, midnight-crossing windows
- [x] 5. Routes /api/forecast, /api/reservoirs/trend, /api/quality with demo fallback
- [x] 6. Self-checks per function in npx tsx lib/queries.ts; shapes published in HANDOFF
- [ ] P1: ops 24-27 in contracts/api.md, run sql/v4.sql; P5: quality_notices.csv + more reservoir readings
- [ ] Surprise card: if the constraint needs data, it goes here first

## After merge 8 (integration)
- [x] P4 dispatch Confirm body supported on /api/dispatch
- [x] water_points table + loader for P4's map layer
- [x] planDay offset for P2's WaterDay swap; districtOf for PublicInfo
- [ ] Live run: needs .env.local (P1) then v3, v4, load-data, seed-demo
