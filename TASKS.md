# TASKS — Kot Delo? (P1 only edits). Finish and commit each step before the next.

Prompt source: docs/BUILD-PROMPT.md (wins over the playbook on the product).

## Round 3 — water-day split, planning only (13 November 2026)

Water-day planner, reminders (must work), tomorrow forecast, reservoir tank diagrams, cloudy-water caution (official notices only for health), save-water + nearby help, prediction model. Owners, shapes (ops 24 to 27) and copy/paste messages: [WATER-DAY-SPLIT.md](docs/WATER-DAY-SPLIT.md). Everyone pulls main first.

## Next requested work — planning only (13 November 2026)

The user requested a task split, with implementation delegated to teammates and merging later. See [NEXT-TASK-SPLIT.md](docs/NEXT-TASK-SPLIT.md) for the source audit, P1–P5 ownership, copy/paste briefs, dependencies and acceptance checks. This does not mark the proposed features implemented or change the frozen API contract. P1's first implementation prerequisite is to reconcile the new scope and contract.

## Step 0 — planning (no app code)
- [x] SPEC.md, contracts/api.md, TASKS.md, README.md, docs/DECISIONS.md filled
- [ ] P1 reviews and approves Step 0
- [x] BLOCKER: `/data/schedule.csv` and `/data/streets.csv` exist (real CWA timetable + streets for La Caverne, Vacoas; PR #5, Fri 16:53). If missing, STOP, do not invent data.

## Build order (demo path first)
- [x] 1a. Code (P1): Next.js + TypeScript + Tailwind + shadcn app, Supabase clients, `sql/schema.sql`, `scripts/load-data.ts`; `npm run build` passes
- [x] 1b. By hand (P1): create Supabase project, run `sql/schema.sql`, put keys in `.env.local` + Vercel env vars, deploy to Vercel (checked Fri 16:20: the live build reaches Supabase, the 8 tables exist, all EMPTY)
- [ ] 1c. (P5 -> P1) data files `data/schedule.csv` + `data/streets.csv`, then `npm run load-data`, then `npm run seed-demo` — files are on main (PR #5). Left (P1 or P3, needs `.env.local`): run both; load-data should print "Loaded 1 areas, 21 streets, 26 schedule rows."

## Fri 14:45 — clickable mockup on main (mock data in lib/mock.ts, live at the Vercel URL)
3 builders, 3 branches, no shared files. Each swaps their screen from `lib/mock.ts` to real Supabase calls.
- **P2 — branch `feat/home`** — owns app/page.tsx, components/home/: steps 2, 3, 4 (UI), 7, 8 (UI). Reports + requests insert via `lib/queries.ts` from P3.
- **P3 — branch `feat/data`** — owns sql/, scripts/, lib/queries.ts: load-data once CSVs land, queries for ops 1, 2, 3, 10, 11, `scripts/seed-demo.ts` (7 days, is_demo=true). Ship `lib/queries.ts` FIRST (by 16:00) so P2 can swap.
- **P4 — branch `feat/driver-map`** — owns app/driver/, app/map/, lib/eta.ts: steps 5 + 6 (the WOW). Ops 4-9 written inline in the driver/map pages.
- P1 merges every ~90 min (PR → review → merge → Vercel redeploys main). P5 = data CSVs + pitch on `feat/data-files`.

Owners: P2 steps 2, 3, 4 (UI), 7, 8 (UI) · P3 queries, seed, reliability and heat-map data · P4 steps 5, 6 · P5 data files + pitch · P1 merges. Details in `team/*/TODO.md`.
Merged so far: #1 feat/data, #2 + #7 feat/home, #3 feat/driver-map, #5 feat/data-files. A tick below = code merged. Nothing has run against real rows yet (the database is empty until 1c is run); what is left is in HANDOFF.md, "Merge 3".
- [x] 2. Home: street picker + today's official window — merged (#2, #7), on `lib/queries.ts`, demo mode while the database is empty
- [x] 3. One-tap reports: "Water is here" / "No water" — merged (#2)
- [x] 4. "I need water" request -> stop list grouped by street — merged (#2 Home, #3 driver)
- [x] 5. /driver: Start round, live location every 5s (watchPosition + Wake Lock), mark stop served, End round stops tracking — merged (#3)
- [x] 6. /map: truck marker via Supabase Realtime, stops away, ETA — merged (#3)
- [x] 7. Schedule vs reality card + reliability score ("on time 4 of 7 days") — merged (#1 query, #7 card + 24 h day track)
- [x] 8. Heat map: streets coloured by hours since last water_on report — merged (#1 query, #7 map + list)
- [ ] E2E on the live URL with real streets: Home request -> /driver round -> /map truck moves, on 2 phones (needs 1c)

**STOP after step 8 and ask P1. No extras on your own.**

## V2 (Fri 17:30) — approved by P1. Scope: SPEC.md "V2 scope", rules: contracts/api.md "V2 additions"
Owners by folder, no shared files:
- **P2 `feat/home`**: app/page.tsx (landing), app/resident/, app/layout.tsx, app/globals.css, components/home/, components/ui/ (shared nav lives here)
- **P3 `feat/data`**: sql/, scripts/, lib/queries.ts
- **P4 `feat/driver-map`**: app/driver/, app/map/, app/ops/, components/map/, components/ops/, lib/eta.ts
- **P5 `feat/data-files`**: data/*.csv, README.md, team/p5-pitch/

Merge 4 (Fri 17:46): #12 feat/data, #13 feat/data-files, #14 feat/driver-map, #15 feat/home are on main. A tick = code merged, not run against real rows. What is left is in HANDOFF.md, "Merge 4".
- [ ] 9. (P1 or P3) `npm run load-data` + `npm run seed-demo` against Supabase. Nothing is real until this is done
- [x] 10. (P3) `sql/v2.sql` (P1 runs it) + `lib/queries.ts` for ops 12, 14, 15, 16, 17, each with a pure function and a self-check; seed-demo adds rows for today and a few complaints. No payment (dropped) — merged (#11 sql, #12 queries + seed). Left (P1): run `sql/v2.sql` in Supabase
- [x] 11. (P5) `data/reservoir.csv`: real daily or weekly Mare aux Vacoas level with source URLs — merged (#13)
- [ ] 12. (P2) Three design directions as PNG (phone + desktop) in team/p2-frontend/design/, P1 picks one — one direction is merged as screenshots (#15), built straight into the app
- [x] 13. (P2) Responsive shell + landing `/`; Home moves to `/resident` — merged (#15)
- [x] 14. (P2) Resident: status with trust (op 15), likely water time (op 16), complaint in two taps (op 14), one report per street per 30 min — merged (#15)
- [x] 15. (P4) `/ops`: reservoir (12), heat map (11), priority list (17), open complaints (14), suspect reports (15) — on main (97b922e)
- [x] 16. (P4) /map and /driver demo mode when `streets` is empty; links go to `/resident` — merged (#14)
- [ ] 17. (All) Two-phone run on the Vercel URL, then polish only

## Merge 5 (Fri evening): NEXT-TASK-SPLIT packages from P2, P3, P4 are on main (feat/home, feat/data, feat/driver-map). Contract V3 adopted (contracts/api.md "V3").
- [ ] 18. (P1) Run `sql/v3.sql` in Supabase, set `SUPABASE_SERVICE_ROLE_KEY` (+ `KD_DEMO_ACCESS=1` or `DRIVER_ACCESS_CODE`/`OPS_ACCESS_CODE`) on Vercel, redeploy
- [ ] 19. (P4) Ops Confirm: use `startStaffSession("ops", code)` + `confirmDispatch()` from `lib/queries.ts` (live Confirm returns 401 until then; demo Confirm works)
- [ ] 20. (P2) After 18: pass litres to `postRequest(street.id, litres)`; `saveGuest` calls `startGuestSession()`
- [ ] 21. (P1) After 19 + 20: `sql/v3-lockdown.sql`

## Extras (only if P1 says so)
- [ ] Crowd "kamion spotted" fallback
- [ ] Water points map
- [ ] AI communiqué parser
- [ ] SurpriseCard content (slot is built into Home from step 2)

## After every step
Append to HANDOFF.md (done / changed / blocked), tick this file, give 5 beginner bullets explaining what was built, commit (no AI co-author line).

## Submission (Sat 12:30)
- [ ] Public repo with commits from kick-off · [ ] app link/APK · [ ] 2-min backup video · [ ] max 6 slides · [ ] README complete · [ ] decision log 5-10 entries
