# HANDOFF (p5-pitch)

## Changed
- `data/schedule.csv`: real CWA timetable for **Vacoas**: every second day from Sat 10 Oct 2026, 03:00–08:00, one row per date up to 30 Nov 2026 (26 rows). Source PDF in `data/sources/`.
- `data/streets.csv`: 21 real streets in La Caverne, Vacoas (OpenStreetMap), area `Vacoas`, `order_index` = suggested truck route.
- `data/raw/`: full OSM street list for Vacoas-Phoenix + Curepipe (979 streets), to switch locality fast.
- `data/context/`: CWA branches + water balance 2000–2021 (data.govmu.org). Not used by the app yet.
- `team/p5-pitch/numbers/`: water figures for the pitch. Claude transcribed them from the Statistics Mauritius *Digest of Environment Statistics 2017*. Verify against the [digest PDF](https://unstats.un.org/unsd/envstats/Compendia/Mauritius_Digest_Environment_Statistics_2018.pdf) before putting any number on a slide.
- `README.md`: Problem, User and Data sources filled in.

## Needs from others
- **P1:** log decision #8 in `docs/DECISIONS.md`: "Locality: La Caverne, Vacoas. Newest CWA communiqué (10 Oct 2026) names Vacoas; every-other-day supply makes schedule vs reality easy to show."
- **P3:** run `npm run load-data` with these CSVs. Today (Fri 13 Nov) is a water day for Vacoas, tomorrow is not. If the app should show the alternating days, `seed-demo.ts` should use the schedule dates.
- **P4:** the map needs "© OpenStreetMap contributors" (Leaflet adds it by default).

## Blocked
- Nothing.

## How to test
1. Every `area` in both CSVs is `Vacoas`. Every `day` is a date 2 days after the previous one. Every time is `HH:MM`.
2. Open `data/sources/cwa-communique-2026-10-10.pdf` and compare it with `schedule.csv`: Vacoas, from samedi 10 octobre 2026, 3:00a.m–8:00a.m, un jour sur deux.
3. `npm run load-data` should print: `Loaded 1 areas, 21 streets, 26 schedule rows.`
4. Paste a few `lat,lng` pairs from `streets.csv` into openstreetmap.org: they should land on the named street in Vacoas.
