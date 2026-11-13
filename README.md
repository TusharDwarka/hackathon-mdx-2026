# Kot Delo? — Hackathon MDX 2026 (theme: Live Better)

> Status (Fri 13 Nov, evening): **V1 built and live on Vercel** (Home, Map, Driver merged). **V2 in progress**: landing, resident, operations screens and the reservoir level. Real CWA timetable, streets and reservoir levels are in `data/`. Loading them into Supabase is a separate step.

## Problem
During CWA water rationing, households in Vacoas (La Caverne neighbourhood), Mauritius, don't know when water will really come or when the tanker truck will arrive. Since 10 October 2026 the CWA supplies Vacoas only every second day, 03:00–08:00.

## User
One household in La Caverne, Vacoas.

## What it does
Shows today's official CWA water window for your street, lets neighbours report "Water is here" / "No water", lets a household request the tanker ("I need water"), and shows the tanker truck moving live with "N stops away, about X min". It then compares the official schedule with what actually happened: reliability score and a heat map of hours without water. V2 adds the Mare aux Vacoas reservoir level, a supply tier, a trust check on reports, a likely water time, two-tap complaints, and an operations screen for the CWA. English labels, phone first, also works on desktop, no login.

## Screens (V2)
| Screen | For | What it shows | State |
|---|---|---|---|
| Landing `/` | everyone | What Kot Delo? is, reservoir level + supply tier, today's window, three ways in | V2, in progress |
| Resident `/resident` | a household | Today's window, reports, "I need water", confirmed / unconfirmed status, likely water time, complaint in two taps, schedule vs reality, heat map | V1 Home is live at `/`; moves here in V2 |
| Map `/map` | a household | Truck moving live, stops away, ETA | live (V1) |
| Driver `/driver` | tanker driver | Start round, GPS every 5 s, mark stop served, end round | live (V1) |
| Operations `/ops` | CWA staff (desktop first) | Reservoir status, heat map, priority list with a suggested action per street, open complaints, suspect reports | V2, in progress |

Everything is rule-based (see `contracts/api.md`), with no AI model inside the app.

## What is demo, not real
- **Supply tier thresholds** (≥ 60% normal, 30–60% watch, < 30% critical) are **our demo values, not CWA policy**. The reservoir **levels** are real. The tier label is not an official CWA status.
- **Seeded reports**: 7 days of neighbour reports (`is_demo = true`), and the extra rows and complaints the V2 seed adds, are generated so the reliability score, heat map, trust check, likely water time and priority list have history. They are **not real neighbour reports**.
- **Truck route order** (`order_index`) is our suggested route, not an official CWA tanker route.
- The app never says whether water is safe or unsafe to drink. It shows the supply tier and official notices only.

## Data sources
All collected Fri 13 Nov 2026.

- **Official CWA water timetable** → `data/schedule.csv` (REAL). Source: CWA communiqué "Nouveaux horaires de distribution d'eau pour les régions de Vacoas, Phoenix, St. Pierre, Curepipe, Forest-Side et Floréal", published 10 Oct 2026 ([post](https://cwa.govmu.org/cwa/?p=5001), [PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Press-Notice-09102026.pdf), copy in `data/sources/`). It says, word for word, "La distribution d’eau se fera tous les deux jours" (every second day), 03:00–08:00: from Sat 10 Oct 2026 for Vacoas, Phoenix and St Pierre, from Sun 11 Oct 2026 for Curepipe, Forest-Side and Floréal. All six areas are in the file (areas without streets don’t show in the resident picker). This notice is the official source for the every-second-day rule. Checked Fri 13 Nov 2026: still the newest timetable on the CWA site. Cleaning: the notice is an image, so the times were typed by hand. "Every second day" is listed as one row per date (10 Oct to 30 Nov 2026), because the loader takes a weekday or a date. Check the [CWA news page](https://cwa.govmu.org/cwa/?cat=2) for a newer notice before the demo.
- **Streets and coordinates** → `data/streets.csv` (REAL). Source: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), via the Overpass API. Cleaning: the 21 named small roads within about 400 m of La Caverne, Vacoas (inside OSM boundary relation 3613476400). `lat`/`lng` = average of the street's segment centres. Street names are kept as spelled in OSM. One duplicate with a typo was dropped. `order_index` is a nearest-neighbour route starting at La Caverne Road, not an official tanker route. The map must show "© OpenStreetMap contributors".
- **Reservoir levels, all 7 main reservoirs** → `data/reservoir.csv` (REAL). Mare aux Vacoas: 10 readings, 14 Aug → 5 Nov 2026 (40.5% → 33%). Each other reservoir has 4 to 6 readings, 14 Aug → 30 Oct or 5 Nov 2026. These are Water Resources Commission (WRC) figures quoted by L’Express (via [allAfrica](https://fr.allafrica.com)), [Defimedia](https://defimedia.info) and [ION News](https://ionnews.mu). Each row has the URL of the article that gives that level for that date. Cleaning: we kept only readings where the article states the date. One undated figure and one conflicting figure for the same day were dropped. Names match the loader (`La Nicoliere` without an accent). No official daily WRC/CWA page with levels was found.
- **Official water-use rules** (shown as links, not loaded): CWA (Dry Season) Regulations 2026, Government Notice No. 141 of 2026 ([PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/08/141_CWA-Dry-Season_Reg-2026.pdf)), and the CWA Water Tank Grant Scheme communiqué of 10 Oct 2026 ([PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Tank-poster-2.pdf)). Summary in `team/p5-pitch/HANDOFF.md`.
- **Water points** → `data/water_points.csv` (REAL, area level only). CWA 30,000 L tanks in Phoenix, Curepipe, Midlands, Alma and Quartier Militaire, from [Le Mauricien, 22 Oct 2026](https://www.lemauricien.com/actualites/societe/crise-de-leau-mare-aux-vacoas-pourrait-tomber-a-20-la-cwa-deploie-des-tanks-de-30-000-litres/721408/). The article names localities, not exact spots, so each point is the OSM centre of that locality and its name says "area only". Ripaille and Résidence Anoska are also named but are not in OSM, so they were left out. No official CWA list of tanker stops or standpipes was found.
- **Official water-quality notices** → `data/quality_notices.csv` (header only, on purpose). No dated CWA or Ministry of Health boil-water or quality notice for 2026 was found (searched Fri 13 Nov 2026). The app must keep showing "no verified advisory". CWA’s standing advice on its [Water Quality page](https://cwa.govmu.org/cwa/?page_id=813) (updated 5 Mar 2026): unusual colour, taste or smell → call the CWA hotline 170.
- **Full street list** for switching locality → `data/raw/osm-streets-vacoas-phoenix-curepipe.csv` (979 streets in Vacoas-Phoenix and Curepipe, same OSM source).
- **Context data** → `data/context/` (REAL, from the national open data portal [data.govmu.org](https://data.govmu.org)). `cwa-branches.csv` is from [Location of CWA branches](https://data.govmu.org/dataset/location-cwa-branches-mauritius). `water-balance-2000-2021.csv` is from data.govmu.org dataset `0e4ea8f5-c1c6-4c63-b34d-a3aa695d6c5b`. Neither is used by the app yet.
- **Supply days by locality and tanker facts** → `data/context/cwa-supply-localities-oct-2026.csv` (53 localities) and `data/context/cwa-tankers-oct-2026.csv` (REAL, not used by the app yet). Localities: Vacoas and Phoenix from the CWA communiqué of 10 Oct 2026. The Saint-Pierre and Curepipe lists come from Defimedia of 14 Oct 2026 ([Saint-Pierre](https://defimedia.info/saint-pierre-et-ses-environs-distribution-deau-un-jour-sur-deux-de-3-h-8-h), [Curepipe](https://defimedia.info/curepipe-distribution-deau-un-jour-sur-deux-de-3-h-8-h)), which quotes the CWA communiqué. Group A gets water on even October dates, group B on odd ones, 03:00–08:00. Tanker facts: [Defimedia, 29 Oct 2026](https://defimedia.info/crise-hydrique-les-camions-citernes-peinent-repondre-la-demande) (31 CWA tankers, 15 for Upper/Lower Mare-aux-Vacoas) and the [CWA private tanker notice](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/WATER-TANKERS-Oct-2026.pdf). **No public tanker timetable by locality exists.** The CWA sends tankers on request (hotline 170 / 601 5000), which is the gap Kot Delo fills.
- **Earlier CWA timetable** (5 Aug 2026, North/East/South/Port-Louis, 2 slots a day): copy in `data/sources/` ([PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/08/HORAIRES-5-1.pdf)). Not loaded.
- **Demo data:** seeded reports flagged `is_demo = true` in the database (see "What is demo, not real"). They are NOT real neighbour reports.

## Stack
Next.js App Router + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres + Realtime) · Leaflet + OpenStreetMap · Vercel. Mobile-first (390px). The tanker is tracked by the driver's phone (`/driver`, geolocation + Wake Lock), not hardware.

## AI tools used
- Claude Code (Anthropic) — planning, code generation, review
- Codex CLI (OpenAI) — code review, bug hunting
- Skills/plugins: Ponytail, Karpathy guidelines
- AI features inside the app: none in the core (rule-based ETA and reliability score)

## Surprise card
TBD (revealed during the event). The Home/Resident screen has an empty `<SurpriseCard />` slot for it.

## Privacy
Reports, requests and complaints are stored by street, never by house or person. Complaints are a fixed category only: no free text, no device id. Only the truck is tracked, and only while a round is active.

## How to run
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase keys (shared over WhatsApp DM, never committed).
3. In Supabase, open the SQL Editor and run `sql/schema.sql`, then `sql/v2.sql`.
4. `npm run load-data` loads the CSVs from `data/`. `npm run seed-demo` adds the demo reports.
5. `npm run dev`, then open http://localhost:3000

## Team
See `team/` for per-person notes, `docs/DECISIONS.md` for decisions and times, `docs/PLAYBOOK.md` for how we work.
