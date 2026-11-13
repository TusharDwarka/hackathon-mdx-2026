# HANDOFF (p5-pitch)

## Round 3 (water-day split) — Fri 13 Nov night

### Changed
- `data/context/cwa-hours-of-supply-2026-06.csv`: 234 localities with normal / dry-season hours (water.cyber.mu, independent republication of CWA data, June 2026 revision). Context only. For the 6 Mare-aux-Vacoas towns, the 10 Oct 2026 communiqué replaces it. Spot-checked La Caverne and Vacoas Centre against the site.
- `data/context/cwa-supply-localities-oct-2026.csv` (53 localities → supply group A/B, every 2 days, 03:00–08:00) and `data/context/cwa-tankers-oct-2026.csv` (fleet size, private tanker specs, hotlines). Context only, not loaded. No public tanker timetable by locality exists: the CWA sends tankers on request.
- `data/reservoir.csv`: **all 7 reservoirs**, 4 to 10 dated WRC readings each (14 Aug → 5 Nov 2026), one source URL per row. Every number was checked against the article text. Mare aux Vacoas gained 14 Aug (40.5), 4 Sep (39.7) and 18 Sep (39.9). Names match `MAIN_RESERVOIRS` in `lib/queries.ts` (`La Nicoliere` without an accent; the loader does not rename `reservoir.csv` rows).
- `data/schedule.csv`: the same CWA notice (10 Oct 2026) also covers **Phoenix, St Pierre** (from Sat 10 Oct) and **Curepipe, Forest-Side, Floreal** (from Sun 11 Oct), all 03:00–08:00, every second day, up to 30 Nov. 26 rows per area, 156 in total. The PDF says word for word "La distribution d'eau se fera tous les deux jours". That is the official source for the every-second-day rule. Still the newest timetable on the CWA site (checked tonight).
- `data/quality_notices.csv`: **header only, on purpose**. There is no 2026 boil-water or quality notice from the CWA or the Ministry of Health. `waterQuality()` must never return `official_notice` from this file as it stands.
- `data/water_points.csv`: 5 CWA 30,000 L tanks (Phoenix, Curepipe, Midlands, Alma, Quartier Militaire), `kind = static_tank`, source Le Mauricien, 22 Oct 2026. **Area level only:** the article names localities, not spots, so `lat`/`lng` is the OSM centre of the locality and each name says "area only, exact spot not published". No official tanker-stop or standpipe list exists. Ripaille and Résidence Anoska are also named but are not in OSM, so they were left out.
- `README.md`: data sources updated for the four files above.
- `team/p5-pitch/slides/prediction-model.md` and `water-day-planner.md`: the two round-3 slides, with speaker notes, sources and Q&A cautions.

### River question (DECISIONS #7): keep it dropped
Official source: **Rivers and Canals Act 1863** (Cap. 421), PDF hosted on the CWA site: [link](https://cwa.govmu.org/cwa/wp-content/uploads/2022/07/RIVERS-AND-CANALS-ACT-Cap-421.pdf).
- s.87: sending "washings or other dirty waters or other liquid that may tend to pollute" into a river is an offence (fine up to Rs 1,000).
- s.68(c): placing any substance "which tends to pollute the water" in or on the bank of a river is an offence.
- The CWA Dry Season Regulations 2026 also ban irrigation from a watercourse feeding a reservoir.

Washing a car with soap in a river matches s.87. That is our reading of the Act, not a court ruling. Nothing official says river water is fit to use. Optional save-water tip for P2, if wanted: "Don't wash cars in rivers: soapy water in a river is an offence (Rivers and Canals Act, s.87)."

### Needs from others
- **P3 (important, op 25):** don't fit the trend line over every reading in the database. `reservoir_levels.csv` has rows from Jan 2025 on, and a fit over all of them gives Mare aux Vacoas 20% in **2028** (slope −0.04). Over the last 60 days before the latest reading it gives −0.135 pts/day and **~84 days to 20%** (about 5 Feb 2027). Over only the 7 original rows it's −0.124 and ~94 days. Pick a window and state it in `note`. Table for every reservoir: `slides/prediction-model.md`.
- **P3:** load `data/water_points.csv` and `data/quality_notices.csv` (new files). The shape for `quality_notices` is `area,day,title,category,source_url` as in WATER-DAY-SPLIT.
- **P4 (map layer):** draw water points as an *area* marker (a circle or "somewhere in Phoenix"), not a precise pin, and don't show a walking distance to them as if it were exact.
- **P2 (quality card):** the CWA's standing advice, from its [Water Quality page](https://cwa.govmu.org/cwa/?page_id=813) (updated 5 Mar 2026): unusual colour, taste or smell → call the hotline **170**. It can be linked as CWA advice.
- **P1:** schedule.csv now creates 5 extra areas with no streets. Resident's picker hides them. The /ops header lists every area name. Tell me if you want them out.

### Not done (in the brief, not asked for this round)
- Item 6 (refresh the README claims list against the live site) and the README "Surprise card" section: still TBD.

### How to test
1. `data/reservoir.csv`: `cut -d, -f1 data/reservoir.csv | sort | uniq -c` → 7 reservoirs, each with ≥ 4 rows. Open a few URLs: the article gives that % for that date.
2. `data/schedule.csv`: 6 areas × 26 rows. Vacoas/Phoenix/St Pierre on even October dates, Curepipe/Forest-Side/Floreal on odd ones.
3. `npm run load-data` → no errors. The reservoirs line should say 7 reservoirs + aggregate.
4. Paste the `water_points.csv` coordinates into openstreetmap.org: each lands on the named locality.

## V2 — Fri 13 Nov evening

### Changed
- `team/p5-pitch/slides/what-after.md` (V2 step 4): "What after?" slide. It maps the ops priority list (op 17) to three fixes: send tanker → more tankers (CWA private tanker registration, Oct 2026), static tank → Water Tank Grant Scheme (Rs 15,000), streets dry week after week → boreholes (15–20 sought, news). Includes speaker notes, sources and Q&A cautions. Footnote says the priority list in the demo runs on seeded reports.
- `README.md` (V2 step 3): status, Screens table, "What is demo, not real" (tier thresholds, seeded reports, route order), reservoir + notice sources, how to run.
- `data/reservoir.csv` (V2 step 1): 7 real Mare aux Vacoas levels, 25 Sep → 5 Nov 2026 (38.5% → 33%). Each row links to the news article that quotes the Water Resources Commission figure for that date. All 7 links open (HTTP 200, checked Fri 13 Nov).
  - Latest row: **33% on 2026-11-05** → tier **watch** (30–60) with the demo thresholds.
  - Left out on purpose: "33.1% on 11 Nov" (no source page confirms it), "35.5%" (L'Express via allAfrica, 10 Oct, no date given for the reading), "about 36.8%" on 2 Oct (conflicts with the dated 36.6% the same day).
  - No official daily WRC/CWA page with levels was found. The CWA site has none. If one turns up, swap the URLs to it.
  - Same date last year, for the pitch only (not in the CSV): 84.6% (mid-Oct 2025, ionnews), 77.9% (30 Oct 2025, ionnews).

### Official notices on water use during rationing (V2 step 2, searched Fri 13 Nov)
**CWA / Ministry of Energy and Public Utilities: yes, these are official.**
1. **CWA (Dry Season) Regulations 2026**, Government Notice No. 141 of 2026. [PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/08/141_CWA-Dry-Season_Reg-2026.pdf), listed on the [CWA site](https://cwa.govmu.org/cwa/?p=4837). In force from **10 Aug 2026**. No end date appears in the text. Some news reports say "until 30 Nov 2026", but the PDF doesn't.
   - No use of domestic water "for any non-essential purpose or in a wasteful manner".
   - No washing a vehicle, driveway, pavement or building, watering a hedge, lawn or garden, or filling a pool "through a hosepipe, sprinkler, pressure washer or any similar device", in a wasteful manner.
   - No irrigation from a reservoir or a watercourse feeding one.
   - Fine up to **Rs 50,000** + up to 2 years in prison for a domestic consumer, up to Rs 200,000 + 2 years otherwise.
2. **Water Tank Grant Scheme** (CWA + Ministry of Energy and Public Utilities + DBM), communiqué dated 10 Oct 2026. [PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Tank-poster-2.pdf), [post](https://cwa.govmu.org/cwa/?p=5009), [online form](https://cwa.govmu.org/cwa/?p=5016). For households with no tank: a grant for a **1000 L + 500 L tank + a pump, Rs 15,000 in total**. Register from Mon 12 Oct 2026, 09:00–15:00, at any CWA office, with ID card + CWA bill.
3. **Cleaning & disinfection of domestic tanks** (CWA poster, uploaded Jul 2022, still linked from the CWA site): [PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2022/07/cleaning-of-tank-1.pdf). Clean tanks at least every 6 months, keep the cover closed (insects, mosquito larvae), and after a water cut "let the water run for a few minutes" to flush stagnant water.
   - ⚠️ The poster says treated water "is now safe for consumption". The contract says **the app never says water is safe or unsafe to drink**. If we show this, link to the CWA poster as CWA's own advice. Don't rephrase it as ours.
4. **CWA appeal to use water judiciously**: reported by Defimedia on 2 Oct 2026 ([article](https://defimedia.info/mare-aux-vacoas-le-niveau-deau-chute-366-la-cwa-appelle-une-utilisation-judicieuse)). The communiqué itself is not on the CWA site, so this is a news report, not an official source.

**Ministry of Health and Wellness: nothing official found.** Its [communiqués page](https://health.govmu.org/health/) (checked 13 Nov 2026) lists no 2026 notice on drinking water, boiling, storing water or hygiene during water cuts. The only related Health advice found is from March 2025 (dengue: keep garden water containers covered), reported by L'Express via [allAfrica](https://fr.allafrica.com/stories/202503240426.html). It is not about rationing, and it's in a news article, not on the ministry's site.

### Needs from others
- **P3:** load `data/reservoir.csv` into `reservoir_levels` (columns match `sql/v2.sql`; `level_pct` is a number like `33.8`, `day` is `YYYY-MM-DD`). Op 12 should return `{level_pct: 33, day: "2026-11-05", tier: "watch"}`.
- **P1:** `feat/data-files` is ready to merge (all 4 V2 steps done). README now says the tier thresholds and seeded reports are demo; please check the Screens table matches what P2/P4 ship.

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
