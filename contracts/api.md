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
| requests | + `fee_rs int`, + `paid_at timestamptz` (DEMO payment: no gateway, no card data) |
| complaints (new) | id, street_id, category ['no_water','dirty_water','tanker_no_show','other'], created_at, status ['open','resolved'] |
| reservoir_levels (new) | id, reservoir, day (date), level_pct, source_url |

Rules stay: no house/person fields, no free text from residents, no device ids. RLS: anon reads all, inserts `complaints`, updates `complaints.status`. `reservoir_levels` is loaded with the service key from `data/reservoir.csv` (`reservoir,day,level_pct,source_url`).

### Operations (all rule-based, no model)
| # | Operation | Who | Effect / rule |
|---|-----------|-----|---------------|
| 12 | GET reservoir status | Landing, Ops | latest `reservoir_levels` row for Mare aux Vacoas -> `{level_pct, day, tier}`. Tier: >= 60 normal, 30 to 60 watch, < 30 critical. DEMO thresholds, labelled as such in the UI |
| 13 | Pay + request (replaces the bare insert of op 3) | Resident | "I need water" shows the fee, the resident confirms a DEMO payment, then insert `requests {street_id, fee_rs, paid_at: now}` |
| 14 | POST complaint `{street_id, category}` / GET open complaints / resolve one | Resident / Ops | insert / list / `status = 'resolved'` |
| 15 | GET street water status with trust | Resident, Ops | reports of the last 3 h for the street: `confirmed` when there are >= 2 reports and >= 2/3 agree, else `unconfirmed`. `suspect` when a single report contradicts both neighbouring streets (previous and next `order_index`) |
| 16 | GET likely water time | Resident, Ops | from the street's `water_on` reports of the last 14 days: the 2-hour slot hit on the most days -> `{from, to, days_hit, days_total}`; null under 3 days of history |
| 17 | GET priority list | Ops | per street: score = hours dry + 12 x waiting requests. Action: "send tanker" (waiting requests > 0), "place a static tank" (dry > 48 h), else "watch" |

Not in V2: real payment, login, drinkability claims (the app shows the supply tier and official notices only, it never says water is safe or unsafe to drink), boreholes (pitch slide, not app).

## Mock / seed data
No separate mock files: real timetable and streets come from `/data/schedule.csv` and `/data/streets.csv`; 7 days of demo reports are seeded with `is_demo = true`.
