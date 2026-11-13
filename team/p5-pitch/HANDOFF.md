# HANDOFF (p5-pitch)

## V2 — Fri 13 Nov evening

### Changed
- `data/reservoir.csv` (V2 step 1): 7 real Mare aux Vacoas levels, 25 Sep → 5 Nov 2026 (38.5% → 33%). Each row links to the news article that quotes the Water Resources Commission figure for that date. All 7 links open (HTTP 200, checked Fri 13 Nov).
  - Latest row: **33% on 2026-11-05** → tier **watch** (30–60) with the demo thresholds.
  - Left out on purpose: "33.1% on 11 Nov" (no source page confirms it), "35.5%" (L'Express via allAfrica, 10 Oct, no date given for the reading), "about 36.8%" on 2 Oct (conflicts with the dated 36.6% the same day).
  - No official daily WRC/CWA page with levels was found. The CWA site has none. If one turns up, swap the URLs to it.
  - Same date last year, for the pitch only (not in the CSV): 84.6% (mid-Oct 2025, ionnews), 77.9% (30 Oct 2025, ionnews).

### Needs from others
- **P3:** load `data/reservoir.csv` into `reservoir_levels` (columns match `sql/v2.sql`; `level_pct` is a number like `33.8`, `day` is `YYYY-MM-DD`). Op 12 should return `{level_pct: 33, day: "2026-11-05", tier: "watch"}`.
- **P1:** merge `feat/data-files` when all V2 steps are done.

## V1 — Fri 13 Nov afternoon

### Changed
- `data/schedule.csv`: real CWA timetable for **Vacoas**: every second day from Sat 10 Oct 2026, 03:00–08:00, one row per date up to 30 Nov 2026 (26 rows). Source PDF in `data/sources/`.
- `data/streets.csv`: 21 real streets in La Caverne, Vacoas (OpenStreetMap), area `Vacoas`, `order_index` = suggested truck route.
- `data/raw/`: full OSM street list for Vacoas-Phoenix + Curepipe (979 streets), to switch locality fast.
- `data/context/`: CWA branches + water balance 2000–2021 (data.govmu.org). Not used by the app yet.
- `team/p5-pitch/numbers/`: water figures for the pitch. Claude transcribed them from the Statistics Mauritius *Digest of Environment Statistics 2017*. Verify against the [digest PDF](https://unstats.un.org/unsd/envstats/Compendia/Mauritius_Digest_Environment_Statistics_2018.pdf) before putting any number on a slide.
- `README.md`: Problem, User and Data sources filled in.

### Needs from others
- **P1:** log decision #8 in `docs/DECISIONS.md`: "Locality: La Caverne, Vacoas. Newest CWA communiqué (10 Oct 2026) names Vacoas; every-other-day supply makes schedule vs reality easy to show."
- **P3:** run `npm run load-data` with these CSVs. Today (Fri 13 Nov) is a water day for Vacoas, tomorrow is not.
- **P4:** the map needs "© OpenStreetMap contributors" (Leaflet adds it by default).

## Blocked
- Nothing.

## How to test
1. `data/reservoir.csv`: 7 rows, all `Mare aux Vacoas`, dates ascending, levels falling. Open any `source_url`: the article gives that % for that date.
2. Every `area` in schedule/streets is `Vacoas`. Every schedule `day` is 2 days after the previous one. Every time is `HH:MM`.
3. Open `data/sources/cwa-communique-2026-10-10.pdf` and compare it with `schedule.csv`: Vacoas, from samedi 10 octobre 2026, 3:00a.m–8:00a.m, un jour sur deux.
4. `npm run load-data` should print: `Loaded 1 areas, 21 streets, 26 schedule rows.`
5. Paste a few `lat,lng` pairs from `streets.csv` into openstreetmap.org: they should land on the named street in Vacoas.
