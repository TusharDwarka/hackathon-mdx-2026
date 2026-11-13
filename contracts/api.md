# Data + API contract — Kot Delo? (P1 only edits; frozen for everyone else)

Backend = Supabase (Postgres + Realtime). The browser uses the anon key for reads/inserts allowed below; the service key is server-side only (Next.js route handlers). Adjust at build step 1 only through P1.

## Tables
| Table | Columns |
|---|---|
| areas | id, name |
| streets | id, area_id, name, lat, lng, order_index |
| schedule | id, area_id, day, start_time, end_time, source_url, source_date |
| reports | id, street_id, type ['water_on','water_off'], created_at, is_demo |
| requests | id, street_id, created_at, status ['waiting','served'] |
| rounds | id, started_at, ended_at, status ['active','done'] |
| round_stops | id, round_id, street_id, stop_order, served_at |
| truck_positions | id, round_id, lat, lng, recorded_at |

Rules: no house/person fields anywhere. `reports.is_demo = true` for seeded rows. Realtime on `truck_positions`, `round_stops`, `requests`.

## Operations (minimum for the demo path)
| # | Operation | Who | Effect |
|---|-----------|-----|--------|
| 1 | GET today's window: `schedule` for the street's area where `day` = today | Home | official window + source |
| 2 | POST report `{street_id, type}` | Home | insert `reports` |
| 3 | POST request `{street_id}` | Home | insert `requests` status 'waiting' |
| 4 | POST /driver start round | Driver | insert `rounds` (active); create `round_stops` from streets with waiting requests, ordered by `streets.order_index` |
| 5 | POST position `{round_id, lat, lng}` every 5s | Driver | insert `truck_positions` (only while round active) |
| 6 | POST serve stop `{round_stop_id}` | Driver | set `round_stops.served_at`; matching `requests.status = 'served'` |
| 7 | POST end round `{round_id}` | Driver | `rounds.status = 'done'`, `ended_at`; stop tracking |
| 8 | GET live truck | Map | latest `truck_positions` of the active round (Realtime) |
| 9 | GET ETA | Map | `20 km/h` travel to next stop + `10 min` per stop before mine; if last position older than 2 min: `stops remaining x 10 min` |
| 10 | GET reliability | Home | per street: days where a `water_on` report fell inside the official window / days with a window, e.g. "on time 4 of 7 days" |
| 11 | GET heat map | Home | per street: hours since last `water_on` report, mapped to colour |

## V2 additions (Fri 17:30, P1). Everything above is unchanged.

### Schema changes (P3 writes `sql/v2.sql`, P1 runs it in Supabase)
| Table | Change |
|---|---|
| complaints (new) | id, street_id, category ['no_water','dirty_water','tanker_no_show','other'], created_at, status ['open','resolved'] |
| reservoir_levels (new) | id, reservoir, day (date), level_pct, source_url |

Rules stay: no house/person fields, no free text from residents, no device ids. RLS: anon reads all, inserts `complaints`, updates `complaints.status`. `reservoir_levels` is loaded with the service key from `data/reservoir.csv` (`reservoir,day,level_pct,source_url`).

### Operations (all rule-based, no model)
| # | Operation | Who | Effect / rule |
|---|-----------|-----|---------------|
| 12 | GET reservoir status | Landing, Ops | latest `reservoir_levels` row for Mare aux Vacoas -> `{level_pct, day, tier}`. Tier: >= 60 normal, 30 to 60 watch, < 30 critical. DEMO thresholds, labelled as such in the UI |
| 13 | REMOVED (payment idea dropped Fri evening). The tanker request stays op 3, free, unchanged | | |
| 14 | POST complaint `{street_id, category}` / GET open complaints / resolve one | Resident / Ops | insert / list / `status = 'resolved'` |
| 15 | GET street water status with trust | Resident, Ops | reports of the last 3 h for the street: `confirmed` when there are >= 2 reports and >= 2/3 agree, else `unconfirmed`. `suspect` when a single report contradicts both neighbouring streets (previous and next `order_index`) |
| 16 | GET likely water time | Resident, Ops | from the street's `water_on` reports of the last 14 days: the 2-hour slot hit on the most days -> `{from, to, days_hit, days_total}`; null under 3 days of history |
| 17 | GET priority list | Ops | per street: score = hours dry + 12 x waiting requests. Action: "send tanker" (waiting requests > 0), "place a static tank" (dry > 48 h), else "watch" |

Not in V2: any payment or fee (dropped), login, drinkability claims (the app shows the supply tier and official notices only, it never says water is safe or unsafe to drink), boreholes (pitch slide, not app).

## V3 (Fri evening, P1). Adopted as written in `team/p3-backend/CONTRACT-V3-PROPOSAL.md`
That file is the V3 contract: schema (`sql/v3.sql`), ops 18 to 23, error codes, sample shapes. P1 confirms all six decisions in it (guest session = hashed cookie token, never a person id; staff access codes; litres 1 to 1000; round = one tank-load; split delivery on; demo limits).
- Writes go through `/api/*` once `sql/v3.sql` and `SUPABASE_SERVICE_ROLE_KEY` are deployed; until then `lib/queries.ts` falls back to the anon insert. `sql/v3-lockdown.sql` runs only after every screen writes through `/api/*`.
- Dispatch: the shape in the proposal wins (`POST /api/dispatch {tanker_id, dispatch_key, split}` with an ops session, one load per call). P4 calls `startStaffSession("ops", code)` + `confirmDispatch()` from `lib/queries.ts` instead of its own body.
- Litres: P2 calls `postRequest(streetId, litres)` only after V3 is live (no anon fallback with litres).

## V4 water day (Fri night, P1). Adopted as written in `team/p3-backend/HANDOFF.md` "Round 3"
Schema: `sql/v4.sql` (table `quality_notices`, read-only for anon). Import types from `@/lib/queries`. Every route answers without a DB using real-data fallbacks with `demo: true`; the UI labels that.
- op 24 `getForecast(areaId?)` → `GET /api/forecast?area_id=` → `Forecast | null` (`next`, `basis` official > every_second_day > history, `confidence`, `tier`, `note`, `source_url`, `demo`).
- op 25 `getReservoirTrend(reservoir)` → `GET /api/reservoirs/trend?reservoir=` → `Trend`; `?reservoir=all` → `{ trends: Trend[]; demo }`. Includes `reaches_30_on` / `reaches_20_on`. Show next to the press figure, never hide the gap.
- op 26 `getWaterQuality(areaId?)` → `GET /api/quality?area_id=` → `Quality` (`none` | `cloudy_possible` | `official_notice`). Fixed messages, never says safe/unsafe.
- op 27 `planDay(window, tasks?)` → steps `{ time, label, kind }[]`. Pure, no API.
- P2 swaps its local `components/home/water-day.ts` for these imports.

## V5 (Fri night, P1). Plan and owners: `docs/SPLIT-V5.md`. Everything above stays unless changed here.
- **Accounts**: Supabase Auth, email + password. Guest (existing V3 guest session) may report and request. **Complaint needs a signed-in user**: `sql/v5.sql` adds `complaints.user_id uuid references auth.users`; RLS insert only when `auth.uid() is not null`; a user reads only their own; ops sees complaints without `user_id`. `/api/complaints` from a guest → `401 sign_in_required`. No profile table, no names, no email shown to anyone else.
- **Requests carry no litres**: `postRequest(streetId)`; residents never choose tank capacity (overrides V3 "litres 1 to 1000"). Ops demand per street = count of waiting requests (households). Tanker capacity is an ops-side value per load.
- **Places for all of Mauritius**: `data/localities.csv` (`name,kind,district,lat,lng,source`) from OSM, table `localities`; `public/places.json` = search index `{n: name, l: locality, d: district, lat, lng}[]` for localities and named streets. Search folds accents and apostrophes.
- **Supply rule per locality**: `data/supply_rules.csv` (`locality,district,region,frequency,start_time,end_time,valid_from,source_url,source_date,basis`), `basis` = `locality_notice` | `regional_timetable` | `unknown`. Forecast returns `basis`; unknown is shown as "Not known yet".
- **Notices**: table `notices` (`id, url unique, published_on, source, raw_text, localities text[], start_time, end_time, dates date[], kind, summary, ai_extracted bool, demo bool`). Filled by `scripts/scrape-notices.ts` (CWA site, GIS, news; no Facebook scraping) and by ops pasting text. `POST /api/notices/parse {text, url?}` (ops session) → parsed notice via Claude, server-side `ANTHROPIC_API_KEY`; validated JSON; cached; demo never needs a live AI call.
- **Safe to drink (op 26 extended)**: `Quality` adds `reasons: ("official_notice"|"heavy_rain"|"low_reservoir")[]`, `advice: string` (fixed, sourced text), `source_url`, `date`. Status stays `none` | `cloudy_possible` | `official_notice`; never "safe".
- **Rivers**: `public/rivers.geojson` (OSM `waterway=river|stream`), `distanceToRiverM(lat, lng)` pure. Location for "near a river" is computed on the phone and never sent or stored.
- **Reminder**: client only, `.ics` download, alarm 30 min before the next window. No server, no stored contact.

## Mock / seed data
No separate mock files: real timetable and streets come from `/data/schedule.csv` and `/data/streets.csv`; 7 days of demo reports are seeded with `is_demo = true`.
