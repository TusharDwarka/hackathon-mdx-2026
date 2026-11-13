# HANDOFF (p1-dwarka)

## Changed
- Merge 1 (Fri 16:10): PR #1 feat/data, #2 feat/home, #3 feat/driver-map are on main (9ed0071) and deployed by Vercel. Full notes: root `HANDOFF.md`, "Merge 1".
- `package.json`: `npm run seed-demo` (asked by P3).
- TASKS.md: 1b, 3, 4, 5, 6 ticked; 2, 7, 8 say what is left.
- Merge 2 (Fri 16:53): PR #5 feat/data-files is on main (772f4e6): real schedule + 21 streets for La Caverne, Vacoas. Decision #8 logged. Notes: root `HANDOFF.md`, "Merge 2".
- Merge 3 (Fri 16:56): PR #7 feat/home is on main (a75ec2f): Home on real queries, heat map, day track, design pass. Build steps 2 to 8 are all merged. Notes: root `HANDOFF.md`, "Merge 3".

## Needs from others
- P1 or P3 (whoever has `.env.local`): `npm run load-data`, then `npm run seed-demo`. Every Supabase table is empty until then.
- P2 (small): Home stays in demo mode if the database takes more than 4 s; add a longer wait or a retry.
- P4: demo mode on /map and /driver when `streets` is empty.
- P3: a few seeded `water_on` rows for today (the heat map has no green otherwise).
- Everyone: `git pull origin main`, then `git merge main` into your branch before the next task.

## Blocked
- End-to-end test on two phones: needs the CSVs loaded into Supabase first (they are in the repo now).

## How to test
- `npm run build`, `npm run lint`, `npx tsx lib/queries.ts`, `npx tsx lib/eta.ts`, `npx tsx scripts/seed-demo.ts --dry-run`: all pass on 9ed0071.
- Live: https://hackathon-mdx-2026.vercel.app (Home), `/driver`, `/map`.
