# DONE (p3-backend)

One line per finished task: what, files, commit hash.

- lib/queries.ts: ops 1, 2, 3, 10, 11 (getTodayWindow, postReport, postRequest, getReliability, getHoursDry) + getStreets/getAreas; self-check `npx tsx lib/queries.ts` — b95162c
- scripts/seed-demo.ts: 7 days of deterministic demo reports (is_demo=true), --dry-run mode; run via node --env-file=.env.local --import tsx scripts/seed-demo.ts — ea839e2
- sql/v2.sql: complaints + reservoir_levels tables, RLS, Realtime on complaints — cfce39b
- scripts/load-data.ts: optional data/reservoir.csv -> reservoir_levels upsert — bdc91a0
- lib/queries.ts: ops 12 (reservoir), 14 (complaints), 15 (status + trust), 16 (likely time), 17 (priority) + getTodayReports, pure rules with self-check — 9953676
- scripts/seed-demo.ts: today's rows, last-2h statuses, 6 complaints, one lone suspect report; dry-run asserts suspect — fc95797
- V3 (NEXT-TASK-SPLIT P3): sql/v3.sql + v3-lockdown.sql, app/api/* (10 routes), lib/queries.ts planner/validators/trust/reservoirs/notices, load-data (all reservoirs, notices, supply), seed-demo (demo complaints only), scripts/test-sql.ts (42 SQL checks in PGlite) — b06aef4
- Round 3 water day: forecastNext / reservoirTrend / waterQuality / planDay (ops 24-27) in lib/queries.ts, routes /api/forecast, /api/reservoirs/trend, /api/quality with demo fallback, sql/v4.sql quality_notices + loader, self-checks + SQL checks — bb82343
- After merge 8: /api/dispatch accepts P4's plan body (capped, server-allocated, idempotent), kd_allocate_load_max, water_points table + loader, planDay offset, districtOf — 4bbce48
- V5: accounts (complaints need sign-in, sql/v5.sql RLS), requests without litres (household dispatch), OSM places + rivers for all Mauritius (scripts/fetch-osm.ts, localities table, search, river distance), CWA/news scraper + AI notice parser + feed, safe-to-drink op 26 with reasons — fc3aa0d, ca917c8, 811cbc3, 709e8a5
- Sat 14 Nov: data/localities.csv committed (305 OSM places with district, ODbL source line; from scripts/fetch-osm.ts, asked by P5) — see commit
- Sat 14 Nov: duplicate streets fix: sql/v6.sql (merge copies, re-point FKs, unique keys), load-data upserts streets on (area_id, name) instead of delete+insert, v6 checks in scripts/test-sql.ts — see commit
- Sat 14 Nov: notice reader no longer matches 'Bassin' inside 'Beau Bassin' (localitiesInText: longest name first, covered text not reused; 3 self-checks) — see commit
- Sat 14 Nov: dropped the unused _ignoredLitres parameter from postRequest (last lint warning) — see commit
- Sat 14 Nov: map ETA copy: 'about 0 min' -> 'arriving now' (etaLabel in lib/eta.ts, used in app/map/page.tsx; P4 files, asked by P3's tester) — see commit
- Sat 14 Nov: ops Overview tile 'Waiting for a tanker' shows households (count of waiting requests) instead of a litres sum; P4 file components/ops/Overview.tsx, asked by the tester — see commit
- Sat 14 Nov: notices feed refreshes itself: scraper core moved to app/api/_lib/notice-scrape.ts, feed re-scrapes after answering when 3 h old, new GET /api/notices/refresh for a cron; scraper run against the live database (7 notices stored) — see commit
- Sat 14 Nov: notice reader accepts a second AI provider (any OpenAI-compatible API via AI_BASE_URL + AI_API_KEY + AI_MODEL, used when ANTHROPIC_API_KEY is not set) — see commit
