# TASKS — Kot Delo? (P1 only edits). Finish and commit each step before the next.

Prompt source: docs/BUILD-PROMPT.md (wins over the playbook on the product).

## Step 0 — planning (no app code)
- [x] SPEC.md, contracts/api.md, TASKS.md, README.md, docs/DECISIONS.md filled
- [ ] P1 reviews and approves Step 0
- [ ] BLOCKER: `/data/schedule.csv` and `/data/streets.csv` exist (real CWA timetable + streets for [LOCALITY]). If missing, STOP, do not invent data.

## Build order (demo path first)
- [ ] 1. Next.js + TypeScript + Tailwind + shadcn app, Supabase project, tables created, Vercel deploy; load `/data/schedule.csv` and `/data/streets.csv`
- [ ] 2. Home: street picker + today's official window
- [ ] 3. One-tap reports: "Delo inn vini" / "Pena delo"
- [ ] 4. "I need water" request -> stop list grouped by street
- [ ] 5. /driver: Start round, live location every 5s (watchPosition + Wake Lock), mark stop served, End round stops tracking
- [ ] 6. /map: truck marker via Supabase Realtime, stops away, ETA
- [ ] 7. Schedule vs reality card + reliability score ("on time 4 of 7 days")
- [ ] 8. Heat map: streets coloured by hours since last water_on report

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
