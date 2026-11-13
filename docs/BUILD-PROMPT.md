# Build prompt — Kot Delo? (from P1, verbatim)

> Repo notes: Step 0 is already done (see HANDOFF.md). The decision log is at `docs/DECISIONS.md`; data files go in `data/` (see `data/README.md`).

You are building "Kot Delo?" for a 24h hackathon (MDX Mauritius, theme: Live
Better). The repo has our starter kit: CLAUDE.md, AGENTS.md, SPEC.md,
contracts/, TASKS.md, HANDOFF.md. Read CLAUDE.md first and follow its rules.
Where this prompt and the kit disagree on the product, this prompt wins.

STEP 0 — before any app code, fill in the kit files and stop for my review:
- SPEC.md: problem, user, demo path, screens, FAKED list (from below)
- contracts/api.md: the tables and functions below
- TASKS.md: the build order below as checkboxes
- README.md: problem, user, data sources, stack, AI tools used, surprise card
  (TBD), how to run
- DECISIONS.md: seed with these, timestamped today: chose web app over native;
  chose water rationing as the problem; tanker tracked by driver's phone, not
  hardware; dropped leak reporting (overlaps CWA's KOREK!); dropped river
  suggestions for safety.

PROBLEM: During CWA water rationing, households in [LOCALITY], Mauritius don't
know when water will really come or when the tanker truck will arrive.
USER: one household in [LOCALITY].

DEMO PATH (build this end to end first, ugly is fine):
1. Resident opens the app, picks their street, sees today's official CWA water
   window from the real timetable.
2. Resident taps "Pena delo", then "I need water".
3. Driver opens /driver, taps "Start round". Stops are the streets with waiting
   requests, in order.
4. Resident's map shows the truck moving live and "3 stops away, about 35 min".
5. Driver taps "Served" at each stop; the resident's status updates live.
6. Resident sees schedule vs reality: official window, neighbour reports,
   reliability score, and a heat map of hours without water.

BUILD ORDER (finish and commit each before the next):
1. Next.js app + Supabase + Vercel deploy; tables created; real timetable
   loaded from /data/schedule.csv and streets from /data/streets.csv
2. Home: street picker + today's official window
3. One-tap reports: "Delo inn vini" / "Pena delo"
4. "I need water" request -> stop list grouped by street
5. /driver: Start round, live location every 5s (watchPosition + Wake Lock),
   mark stop served, End round stops tracking
6. /map: truck marker via Supabase Realtime, stops away, ETA
7. Schedule vs reality card + reliability score ("on time 4 of 7 days")
8. Heat map: streets coloured by hours since last water_on report
STOP after step 8 and ask me. Do not start extras on your own.
Extras, only if I say so: crowd "kamion spotted" fallback, water points map,
AI communiqué parser, SurpriseCard content.

ETA RULE: travel time at 20 km/h to the next stop + 10 min per stop before
mine. If GPS is stale (>2 min), fall back to stops remaining x 10 min.

STACK: Next.js App Router + TypeScript + Tailwind + shadcn/ui, Supabase
(Postgres + Realtime), Leaflet + OpenStreetMap, Vercel. Mobile-first at 390px.

TABLES:
areas(id, name)
streets(id, area_id, name, lat, lng, order_index)
schedule(id, area_id, day, start_time, end_time, source_url, source_date)
reports(id, street_id, type['water_on','water_off'], created_at, is_demo)
requests(id, street_id, created_at, status['waiting','served'])
rounds(id, started_at, ended_at, status['active','done'])
round_stops(id, round_id, street_id, stop_order, served_at)
truck_positions(id, round_id, lat, lng, recorded_at)

HARD RULES:
- Start from empty: write all app code fresh, copy nothing from other repos.
- Screens: Home, Map, Driver only. No login, no admin, no settings.
- Real data for schedule and streets. Seed 7 days of demo reports with
  is_demo = true, and say so in the README.
- Store reports and requests by street, never by house or person. Track only
  the truck, only while a round is active.
- Leave an empty <SurpriseCard /> slot on Home for a constraint revealed later.
- Kreol labels with English underneath. Big tap targets.
- Secrets in .env.local, never committed. Service key server-side only.
- Least code that works. No tests, no abstractions for later.
- Commit after every working step. No AI co-author line in commit messages.
- After each step: append to HANDOFF.md (done / changed / blocked), tick
  TASKS.md, and give me 5 beginner bullets explaining what you built.
- If /data/schedule.csv is missing, stop and tell me. Do not invent timetable
  data.
- Tell me exactly what I must do by hand (Supabase project, env vars, Vercel).
