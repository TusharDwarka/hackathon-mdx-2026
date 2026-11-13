# HANDOFF (p1-dwarka)

## Changed
- Merge 1 (Fri 16:10): PR #1 feat/data, #2 feat/home, #3 feat/driver-map are on main (9ed0071) and deployed by Vercel. Full notes: root `HANDOFF.md`, "Merge 1".
- `package.json`: `npm run seed-demo` (asked by P3).
- TASKS.md: 1b, 3, 4, 5, 6 ticked; 2, 7, 8 say what is left.

## Needs from others
- P5: `data/streets.csv` + `data/schedule.csv`. Every Supabase table is empty until they are loaded.
- P2: swap Home to `lib/queries.ts` (it is on main now).
- P4: `STREET_KEY = "kotdelo.street"` in `app/map/page.tsx`; demo mode when `streets` is empty.
- P3: a few seeded `water_on` rows for today (the heat map has no green otherwise).
- Everyone: `git pull origin main`, then `git merge main` into your branch before the next task.

## Blocked
- End-to-end test on two phones: needs the CSVs loaded first.

## How to test
- `npm run build`, `npm run lint`, `npx tsx lib/queries.ts`, `npx tsx lib/eta.ts`, `npx tsx scripts/seed-demo.ts --dry-run`: all pass on 9ed0071.
- Live: https://hackathon-mdx-2026.vercel.app (Home), `/driver`, `/map`.
