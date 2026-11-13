# Kot Delo? — Hackathon MDX 2026 (theme: Live Better)

> Status: planning done (Step 0), build not started. TBD items are filled as we decide.

## Problem
During CWA water rationing, households in Vacoas (La Caverne neighbourhood), Mauritius, don't know when water will really come or when the tanker truck will arrive. Since 10 October 2026 the CWA supplies Vacoas only every second day, 03:00–08:00.

## User
One household in La Caverne, Vacoas.

## What it does
Shows today's official CWA water window for your street, lets neighbours report "Water is here" / "No water", lets a household request the tanker ("I need water"), and shows the tanker truck moving live with "N stops away, about X min". It then compares the official schedule with what actually happened: reliability score and a heat map of hours without water. English labels.

## Data sources
All collected Fri 13 Nov 2026.

- **Official CWA water timetable** → `data/schedule.csv` (REAL). Source: CWA communiqué "Nouveaux horaires de distribution d'eau pour les régions de Vacoas, Phoenix, St. Pierre, Curepipe, Forest-Side et Floréal", published 10 Oct 2026 ([post](https://cwa.govmu.org/cwa/?p=5001), [PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Press-Notice-09102026.pdf), copy in `data/sources/`). It says Vacoas gets water every second day from Sat 10 Oct 2026, 03:00–08:00. Cleaning: the notice is an image, so the times were typed by hand. "Every second day" is listed as one row per date (10 Oct to 30 Nov 2026), because the loader takes a weekday or a date. Check the [CWA news page](https://cwa.govmu.org/cwa/?cat=2) for a newer notice before the demo.
- **Streets and coordinates** → `data/streets.csv` (REAL). Source: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), via the Overpass API. Cleaning: the 21 named small roads within about 400 m of La Caverne, Vacoas (inside OSM boundary relation 3613476400). `lat`/`lng` = average of the street's segment centres. Street names are kept as spelled in OSM. One duplicate with a typo was dropped. `order_index` is a nearest-neighbour route starting at La Caverne Road, not an official tanker route. The map must show "© OpenStreetMap contributors".
- **Full street list** for switching locality → `data/raw/osm-streets-vacoas-phoenix-curepipe.csv` (979 streets in Vacoas-Phoenix and Curepipe, same OSM source).
- **Context data** → `data/context/` (REAL, from the national open data portal [data.govmu.org](https://data.govmu.org)). `cwa-branches.csv` is from [Location of CWA branches](https://data.govmu.org/dataset/location-cwa-branches-mauritius). `water-balance-2000-2021.csv` is from data.govmu.org dataset `0e4ea8f5-c1c6-4c63-b34d-a3aa695d6c5b`. Neither is used by the app yet.
- **Earlier CWA timetable** (5 Aug 2026, North/East/South/Port-Louis, 2 slots a day): copy in `data/sources/` ([PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/08/HORAIRES-5-1.pdf)). Not loaded.
- **Demo data:** 7 days of seeded reports, flagged `is_demo = true` in the database, so the schedule-vs-reality card and heat map have history. They are NOT real neighbour reports.

## Stack
Next.js App Router + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres + Realtime) · Leaflet + OpenStreetMap · Vercel. Mobile-first (390px). The tanker is tracked by the driver's phone (`/driver`, geolocation + Wake Lock), not hardware.

## AI tools used
- Claude Code (Anthropic) — planning, code generation, review
- Codex CLI (OpenAI) — code review, bug hunting
- Skills/plugins: Ponytail, Karpathy guidelines
- AI features inside the app: none in the core (rule-based ETA and reliability score)

## Surprise card
TBD (revealed during the event). The Home screen has an empty `<SurpriseCard />` slot for it.

## Privacy
Reports and requests are stored by street, never by house or person. Only the truck is tracked, and only while a round is active.

## How to run
TBD after build step 1 (`.env.local` with Supabase keys, `npm install`, `npm run dev`).

## Team
See `team/` for per-person notes, `docs/DECISIONS.md` for decisions and times, `docs/PLAYBOOK.md` for how we work.
