# DONE (p3-backend)

One line per finished task: what, files, commit hash.

- lib/queries.ts: ops 1, 2, 3, 10, 11 (getTodayWindow, postReport, postRequest, getReliability, getHoursDry) + getStreets/getAreas; self-check `npx tsx lib/queries.ts` — b95162c
- scripts/seed-demo.ts: 7 days of deterministic demo reports (is_demo=true), --dry-run mode; run via node --env-file=.env.local --import tsx scripts/seed-demo.ts — ea839e2
- sql/v2.sql: complaints + reservoir_levels tables, RLS, Realtime on complaints — cfce39b
- scripts/load-data.ts: optional data/reservoir.csv -> reservoir_levels upsert — bdc91a0
- lib/queries.ts: ops 12 (reservoir), 14 (complaints), 15 (status + trust), 16 (likely time), 17 (priority) + getTodayReports, pure rules with self-check — 9953676
- scripts/seed-demo.ts: today's rows, last-2h statuses, 6 complaints, one lone suspect report; dry-run asserts suspect — fc95797
