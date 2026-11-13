# TASKS — Kot Delo? (P1 only edits). Finish and commit each step before the next.

Prompt source: docs/BUILD-PROMPT.md (wins over the playbook on the product).

## Step 0 — planning (no app code)
- [x] SPEC.md, contracts/api.md, TASKS.md, README.md, docs/DECISIONS.md filled
- [ ] P1 reviews and approves Step 0
- [ ] BLOCKER: `/data/schedule.csv` and `/data/streets.csv` exist (real CWA timetable + streets for [LOCALITY]). If missing, STOP, do not invent data.

## Build order (demo path first)
- [x] 1a. Code (P1): Next.js + TypeScript + Tailwind + shadcn app, Supabase clients, `sql/schema.sql`, `scripts/load-data.ts`; `npm run build` passes
- [x] 1b. By hand (P1): create Supabase project, run `sql/schema.sql`, put keys in `.env.local` + Vercel env vars, deploy to Vercel (checked Fri 16:20: the live build reaches Supabase, the 8 tables exist, all EMPTY)
- [ ] 1c. (P5 -> P1) data files `data/schedule.csv` + `data/streets.csv`, then `npm run load-data`, then `npm run seed-demo` (BLOCKED: files missing)

## Fri 14:45 — clickable mockup on main (mock data in lib/mock.ts, live at the Vercel URL)
3 builders, 3 branches, no shared files. Each swaps their screen from `lib/mock.ts` to real Supabase calls.
- **P2 — branch `feat/home`** — owns app/page.tsx, components/home/: steps 2, 3, 4 (UI), 7, 8 (UI). Reports + requests insert via `lib/queries.ts` from P3.
- **P3 — branch `feat/data`** — owns sql/, scripts/, lib/queries.ts: load-data once CSVs land, queries for ops 1, 2, 3, 10, 11, `scripts/seed-demo.ts` (7 days, is_demo=true). Ship `lib/queries.ts` FIRST (by 16:00) so P2 can swap.
- **P4 — branch `feat/driver-map`** — owns app/driver/, app/map/, lib/eta.ts: steps 5 + 6 (the WOW). Ops 4-9 written inline in the driver/map pages.
- P1 merges every ~90 min (PR → review → merge → Vercel redeploys main). P5 = data CSVs + pitch on `feat/data-files`.

Owners: P2 steps 2, 3, 4 (UI), 7, 8 (UI) · P3 queries, seed, reliability and heat-map data · P4 steps 5, 6 · P5 data files + pitch · P1 merges. Details in `team/*/TODO.md`.
Merge 1 (Fri 16:10): PR #1 feat/data, #2 feat/home, #3 feat/driver-map are on main. A tick below = code merged. Nothing has run against real rows yet; what is left is in HANDOFF.md, "Merge 1".
- [ ] 2. Home: street picker + today's official window — UI merged (#2) on mock streets and window. Left (P2): swap to `getStreets` / `getTodayWindow`; needs 1c
- [x] 3. One-tap reports: "Water is here" / "No water" — merged (#2)
- [x] 4. "I need water" request -> stop list grouped by street — merged (#2 Home, #3 driver)
- [x] 5. /driver: Start round, live location every 5s (watchPosition + Wake Lock), mark stop served, End round stops tracking — merged (#3)
- [x] 6. /map: truck marker via Supabase Realtime, stops away, ETA — merged (#3)
- [ ] 7. Schedule vs reality card + reliability score ("on time 4 of 7 days") — card merged on fake data (#2), `getReliability` merged (#1). Left (P2): wire them
- [ ] 8. Heat map: streets coloured by hours since last water_on report — `getHoursDry` merged (#1), Home list still mock. Left (P2): wire it
- [ ] E2E on the live URL with real streets: Home request -> /driver round -> /map truck moves, on 2 phones (needs 1c)

**STOP after step 8 and ask P1. No extras on your own.**

## Extras (only if P1 says so)
- [ ] Crowd "kamion spotted" fallback
- [ ] Water points map
- [ ] AI communiqué parser
- [ ] SurpriseCard content (slot is built into Home from step 2)

## After every step
Append to HANDOFF.md (done / changed / blocked), tick this file, give 5 beginner bullets explaining what was built, commit (no AI co-author line).

## Submission (Sat 12:30)
- [ ] Public repo with commits from kick-off · [ ] app link/APK · [ ] 2-min backup video · [ ] max 6 slides · [ ] README complete · [ ] decision log 5-10 entries
