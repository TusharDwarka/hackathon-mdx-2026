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
