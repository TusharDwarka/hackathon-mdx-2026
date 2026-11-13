# DONE (p3-backend)

One line per finished task: what, files, commit hash.

- lib/queries.ts: ops 1, 2, 3, 10, 11 (getTodayWindow, postReport, postRequest, getReliability, getHoursDry) + getStreets/getAreas; self-check `npx tsx lib/queries.ts` — b95162c
- scripts/seed-demo.ts: 7 days of deterministic demo reports (is_demo=true), --dry-run mode; run via node --env-file=.env.local --import tsx scripts/seed-demo.ts — ea839e2
- sql/v2.sql: complaints + reservoir_levels tables, RLS, Realtime on complaints — cfce39b
- scripts/load-data.ts: optional data/reservoir.csv -> reservoir_levels upsert — bdc91a0
