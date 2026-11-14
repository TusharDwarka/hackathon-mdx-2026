# Kot Delo? — Hackathon MDX 2026 (theme: Live Better)

> Status (Sat 14 Nov, morning): **live at https://hackathon-mdx-2026.vercel.app**. All screens below are merged on `main` (40 pull requests since kickoff). Real CWA timetables, OpenStreetMap streets and reservoir levels are in `data/` and loaded into Supabase. Decision log: `docs/DECISIONS.md`.

## Problem
During CWA water rationing, households in Vacoas (La Caverne neighbourhood), Mauritius, don't know when water will really come or when the tanker truck will arrive. Since 10 October 2026 the CWA supplies Vacoas only every second day, 03:00–08:00.

## User
One household in La Caverne, Vacoas (the demo street set). Any locality on the main island can be searched; the two other users are the tanker driver and CWA operations staff.

## What it does
- **When does water come?** Search your locality or street, see the official CWA supply window and where that rule comes from (official notice, regional timetable, or "Not known yet"). "Remind me 30 min before" adds it to your calendar.
- **What is really happening?** Neighbours report "Water is here" / "No water" in one tap. The app compares the official schedule with the reports: reliability score, a 24-hour track and a heat map of hours without water.
- **Where is the tanker?** A household requests a tanker; the driver's stop list builds itself; the resident watches the truck move live with "N stops away, about X min".
- **Is my tap water safe to drink?** Official notices, heavy rain in the last 48 h and reservoir level, with sourced advice for each situation (CWA, Ministry of Health, WHO).
- **How much water is left?** All 7 main reservoirs with their trend, and a supply tier.
- **For the CWA:** an operations screen that plans tanker loads from the requests, lists complaints and reports to check, and reads pasted CWA notices with AI.

Phone first, also works on desktop. English, French and Kreol Morisien. Guests can browse, report and request a tanker; a complaint needs an email account.

## Screens
| Screen | For | What it shows |
|---|---|---|
| Landing `/` | everyone | What Kot Delo? is, reservoir level + supply tier, today's window, ways in |
| Resident `/resident` | a household | Tabs: Overview, Is my tap water safe?, Water schedule, Report water, Request a tanker, Reservoirs, CWA notices |
| Map `/map` | a household | Live tankers, stops away and ETA; layers for reports (last 3 h), supply reliability (14 days), official notices, water points, rivers, localities; search and "near a river?" |
| Driver `/driver` | tanker driver | Start round, GPS every 5 s, mark stop served, end round |
| Operations `/ops` | CWA staff (desktop first) | Overview (reservoirs, trend, forecast), Dispatch (tanker loads from requests), Complaints, Reports to check, Notices (paste a notice, AI reads it, staff publish it) |
| Login `/login` | everyone | Log in, sign up or continue as guest; driver and CWA staff enter an access code |
| Guide `/guide` | everyone | How to use the app, per role |
| Sources `/sources` | everyone | Every data source and how it was collected |

The schedule, ETA, reliability score, trust check, forecast and dispatch plan are plain rules (see `contracts/api.md`). The one AI model in the app reads CWA notices; see "AI tools used".

## What is demo, not real
- **Supply tier thresholds** (≥ 60% normal, 30–59% watch, < 30% critical) are **our demo values, not CWA policy**. The reservoir **levels** are real. The tier label is not an official CWA status.
- **Seeded reports**: 7 days of neighbour reports (`is_demo = true`), and the extra rows and complaints the seed adds, are generated so the reliability score, heat map, trust check, likely water time and dispatch plan have history. They are **not real neighbour reports**.
- **Truck route order** (`order_index`) is our suggested route, not an official CWA tanker route. **Tanker names and capacities** in Dispatch are demo values: no public CWA tanker timetable or fleet list by locality exists.
- **Forecasts** (next water window, days until a reservoir reaches 20%) are estimates from the timetable and the recent trend, never a promise.
- **Drinking-water advice** is quoted from official sources, each line linked. The app does not test water and cannot certify the water at your tap.

## Data sources
All collected Fri 13 Nov 2026.

- **Official CWA water timetable** → `data/schedule.csv` (REAL). Source: CWA communiqué "Nouveaux horaires de distribution d'eau pour les régions de Vacoas, Phoenix, St. Pierre, Curepipe, Forest-Side et Floréal", published 10 Oct 2026 ([post](https://cwa.govmu.org/cwa/?p=5001), [PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Press-Notice-09102026.pdf), copy in `data/sources/`). It says, word for word, "La distribution d’eau se fera tous les deux jours" (every second day), 03:00–08:00: from Sat 10 Oct 2026 for Vacoas, Phoenix and St Pierre, from Sun 11 Oct 2026 for Curepipe, Forest-Side and Floréal. All six areas are in the file (areas without streets don’t show in the resident picker). This notice is the official source for the every-second-day rule. Checked Fri 13 Nov 2026: still the newest timetable on the CWA site. Cleaning: the notice is an image, so the times were typed by hand. "Every second day" is listed as one row per date (10 Oct to 30 Nov 2026), because the loader takes a weekday or a date. Check the [CWA news page](https://cwa.govmu.org/cwa/?cat=2) for a newer notice before the demo.
- **Streets and coordinates** → `data/streets.csv` (REAL). Source: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), via the Overpass API. Cleaning: the 21 named small roads within about 400 m of La Caverne, Vacoas (inside OSM boundary relation 3613476400). `lat`/`lng` = average of the street's segment centres. Street names are kept as spelled in OSM. One duplicate with a typo was dropped. `order_index` is a nearest-neighbour route starting at La Caverne Road, not an official tanker route. The map must show "© OpenStreetMap contributors".
- **Reservoir levels, all 7 main reservoirs** → `data/reservoir.csv` (REAL). Updated Sat 14 Nov 2026: Mare aux Vacoas 33% on 12 Nov ([Le Mauricien, 13 Nov](https://www.lemauricien.com/actualites/societe/secheresse-mare-aux-vacoas-a-33-la-baisse-du-niveau-vue-du-ciel/723192/)), all reservoirs 49.6% on 5 Nov ([Defimedia](https://defimedia.info/eau-les-principaux-reservoirs-remplis-496-les-fournisseurs-reclament-une-revision-de-la-subvention)); both upserted into Supabase. Mare aux Vacoas: 10 readings, 14 Aug → 5 Nov 2026 (40.5% → 33%). Each other reservoir has 4 to 6 readings, 14 Aug → 30 Oct or 5 Nov 2026. These are Water Resources Commission (WRC) figures quoted by L’Express (via [allAfrica](https://fr.allafrica.com)), [Defimedia](https://defimedia.info) and [ION News](https://ionnews.mu). Each row has the URL of the article that gives that level for that date. Cleaning: we kept only readings where the article states the date. One undated figure and one conflicting figure for the same day were dropped. Names match the loader (`La Nicoliere` without an accent). No official daily WRC/CWA page with levels was found.
- **Official water-use rules** (shown as links, not loaded): CWA (Dry Season) Regulations 2026, Government Notice No. 141 of 2026 ([PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/08/141_CWA-Dry-Season_Reg-2026.pdf)), and the CWA Water Tank Grant Scheme communiqué of 10 Oct 2026 ([PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Tank-poster-2.pdf)). Summary in `team/p5-pitch/HANDOFF.md`.
- **Water points** → `data/water_points.csv` (REAL, area level only). CWA 30,000 L tanks in Phoenix, Curepipe, Midlands, Alma and Quartier Militaire, from [Le Mauricien, 22 Oct 2026](https://www.lemauricien.com/actualites/societe/crise-de-leau-mare-aux-vacoas-pourrait-tomber-a-20-la-cwa-deploie-des-tanks-de-30-000-litres/721408/). The article names localities, not exact spots, so each point is the OSM centre of that locality and its name says "area only". Ripaille and Résidence Anoska are also named but are not in OSM, so they were left out. No official CWA list of tanker stops or standpipes was found.
- **Official water-quality notices** → `data/quality_notices.csv` (header only, on purpose). **None found.** Checked Fri 13 Nov 2026: CWA news + RSS, CWA Water Quality page, Ministry of Health site, GIS, Defimedia, Le Mauricien, ION News. There is no dated 2026 CWA or Ministry of Health boil-water or quality notice. Closest: brown water in Port-Louis, Rose-Hill and Beau-Bassin in July 2026 ([L'Express via allAfrica, 6 Jul 2026](https://fr.allafrica.com/stories/202607060723.html)). The CWA blamed pipe works near Bagatelle and gave no advisory, so it is news, not a notice. The app must show "no official advisory found".
- **What-to-do text for "Is my tap water safe to drink?"** → `data/context/water-safety-sources.csv` (REAL, quoted word for word). CWA [Water Quality page](https://cwa.govmu.org/cwa/?page_id=813) (cloudy/smell → call 170). Ministry of Health [heavy-rain advice](https://govmu.org/FR/infoservices/healthandmedicalservices/Pages/healthadvice.aspx) ("Faites bouillir l'eau avant de la boire"), also reported in 2014 and 2021. WHO [Boil water brief](https://iris.who.int/handle/10665/155821). CWA tank-cleaning poster. Met Services heavy-rain and torrential-rain warning pages, for the `heavy_rain` reason. The CWA FAQ says tap water is "safe": quote it as the CWA's claim, never as ours.
- **Full street list** for switching locality → `data/raw/osm-streets-vacoas-phoenix-curepipe.csv` (979 streets in Vacoas-Phoenix and Curepipe, same OSM source).
- **Context data** → `data/context/` (REAL, from the national open data portal [data.govmu.org](https://data.govmu.org)). `cwa-branches.csv` is from [Location of CWA branches](https://data.govmu.org/dataset/location-cwa-branches-mauritius). `water-balance-2000-2021.csv` is from data.govmu.org dataset `0e4ea8f5-c1c6-4c63-b34d-a3aa695d6c5b`. Neither is used by the app yet.
- **Supply days by locality and tanker facts** → `data/context/cwa-supply-localities-oct-2026.csv` (53 localities) and `data/context/cwa-tankers-oct-2026.csv` (REAL, not used by the app yet). Localities: Vacoas and Phoenix from the CWA communiqué of 10 Oct 2026. The Saint-Pierre and Curepipe lists come from Defimedia of 14 Oct 2026 ([Saint-Pierre](https://defimedia.info/saint-pierre-et-ses-environs-distribution-deau-un-jour-sur-deux-de-3-h-8-h), [Curepipe](https://defimedia.info/curepipe-distribution-deau-un-jour-sur-deux-de-3-h-8-h)), which quotes the CWA communiqué. Group A gets water on even October dates, group B on odd ones, 03:00–08:00. Tanker facts: [Defimedia, 29 Oct 2026](https://defimedia.info/crise-hydrique-les-camions-citernes-peinent-repondre-la-demande) (31 CWA tankers, 15 for Upper/Lower Mare-aux-Vacoas) and the [CWA private tanker notice](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/WATER-TANKERS-Oct-2026.pdf). **No public tanker timetable by locality exists.** The CWA sends tankers on request (hotline 170 / 601 5000), which is the gap Kot Delo fills.
- **Hours of supply by locality** → `data/context/cwa-hours-of-supply-2026-06.csv` (234 localities, not used by the app yet). Coverage: MAV Upper (Vacoas 52, Curepipe 48, St Pierre 36) and MAV Lower (98). It lists normal and dry-season windows, hours per day and, for MAV Lower, subscriber counts. Source: [water.cyber.mu](https://water.cyber.mu/hours-of-supply/mav-upper-vacoas/), an **independent site republishing CWA data, not the CWA itself**. Retrieved 13 Nov 2026. The data is the CWA revision of **June 2026**. For Vacoas, Phoenix, St Pierre, Curepipe, Forest-Side and Floréal, the CWA communiqué of 10 Oct 2026 has since replaced it (every 2 days, 03:00–08:00).
- **Supply rule for every locality** → `data/supply_rules.csv` (REAL, contract V5). 347 localities, 558 rows (two rows when a locality gets two slots a day). The locality list is P3's OSM index (`public/places.json`, 306 places on the main island) plus the 53 names in the October notice. `basis` says where each rule comes from. **`locality_notice` (66 localities):** named in the CWA communiqué of 10 Oct 2026 or in the two Defimedia articles quoting it: every 2 days, 03:00–08:00. **`regional_timetable` (211):** the CWA timetable of 5 Aug 2026, by district. The CWA names regions, not districts, so the district → region mapping is ours: Port Louis → Port-Louis; Pamplemousses, Rivière du Rempart → North; Flacq → East; Grand Port, Savanne → South. **`unknown` (70):** the rest of Plaines Wilhems, Moka and Black River. Their 17 Jun 2026 restrictions ("five to six hours a day") were never published with hours, so times are left blank. Built by `team/p5-pitch/build_supply_rules.py`.
- **Earlier CWA timetable** (5 Aug 2026, North/East/South/Port-Louis, 2 slots a day): copy in `data/sources/` ([PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/08/HORAIRES-5-1.pdf)). Used in `supply_rules.csv`.
- **Demo data:** seeded reports flagged `is_demo = true` in the database (see "What is demo, not real"). They are NOT real neighbour reports.

## Stack
Next.js App Router + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres + Realtime + Auth) · Leaflet + OpenStreetMap · Vercel. Mobile-first (390px). The tanker is tracked by the driver's phone (`/driver`, geolocation + Wake Lock), not hardware.

## AI tools used
- Claude Code (Anthropic) — planning, code generation, review
- Codex CLI (OpenAI) — code review, bug hunting
- Skills/plugins: Ponytail, Karpathy guidelines
- AI inside the app: Claude (`claude-haiku-4-5`) reads CWA notices, scraped from the CWA site and news feeds or pasted by staff, into localities, dates and times. Staff check the reading before publishing; results are cached and labelled "AI-read". With no API key or an AI error, a rule reader takes over. The ETA, reliability score, forecast and dispatch plan are rule-based.
- French and Kreol Morisien translations of the whole UI were drafted with Claude (components/ui/i18n-dict-*.ts) and reviewed by the team
- Every data source and how it was collected is listed in the app at /sources

## Surprise card
**"Let a new user reach the main feature independently."** (`docs/DECISIONS.md` #8)
- **First-visit tour** (`components/home/Guide.tsx`): a skippable 30-second spotlight tour on the landing page and on `/resident` that points at the real buttons: search your place → today's water window → reminder → report → request a tanker.
- **Always reachable again:** the drop logo pulses with a tip and reopens the tour; `/guide` explains each role (resident, tanker driver, CWA staff).
- **No wall before the feature:** "Browse" on the landing goes straight to the resident screen as a guest; the main feature (today's water time for your place) needs one search, no account.
- **Visible in the app:** the surprise card sits first on the Resident overview and links to `/guide`.

## Privacy
Reports and requests are stored by street, never by house or person. A complaint is a fixed category only (no free text) and needs a signed-in account, so it can be traced if abused: the app stores an email login and nothing else, no name and no profile. Guest sessions are an opaque random token that expires after 24 h (only its hash is stored), used for rate limits. Only the truck is tracked, and only while a round is active.

## How to run
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase keys (shared over WhatsApp DM, never committed). Optional, server only: `ANTHROPIC_API_KEY` (AI notice reading; without it the rule reader is used), `DRIVER_ACCESS_CODE` and `OPS_ACCESS_CODE` (without them the codes `demo-driver` and `demo-ops` work in local dev only).
3. In Supabase, open the SQL Editor and run, in this order: `sql/schema.sql`, `sql/v2.sql`, `sql/v3.sql`, `sql/v4.sql`, `sql/v5.sql`, `sql/v6.sql`. Then Authentication → Providers → Email on, "Confirm email" off for the demo.
4. `npm run load-data` loads the CSVs from `data/`. `npm run seed-demo` adds the demo reports.
5. `npm run dev`, then open http://localhost:3000
6. Self-checks: `npx tsx lib/queries.ts`, `npx tsx lib/eta.ts`, `npx tsx components/ops/rules.ts`.

## Team
See `team/` for per-person notes, `docs/DECISIONS.md` for decisions and times, `docs/PLAYBOOK.md` for how we work.
