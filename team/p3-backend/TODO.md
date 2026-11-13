# TODO (p3-backend) — data, queries, seed
Branch: feat/data. Own: sql/, scripts/, lib/queries.ts, app/api/*. Contract: contracts/api.md (only P1 edits it).

- [ ] Review sql/schema.sql with P1; confirm the RLS policies are enough for the demo path
- [x] lib/queries.ts: today's window for a street's area (op 1), insert report (2), insert request (3)
- [x] lib/queries.ts: reliability per street (op 10) and hours since last water_on per street (op 11)
- [ ] scripts/seed-demo.ts: 7 days of demo reports with is_demo = true, realistic and varied (some on time, some late)
- [ ] Make sure `npm run load-data` works once P5's CSVs are in data/
- [ ] Never store anything by house or person
