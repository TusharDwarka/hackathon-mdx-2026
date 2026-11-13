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

## Mock / seed data
No separate mock files: real timetable and streets come from `/data/schedule.csv` and `/data/streets.csv`; 7 days of demo reports are seeded with `is_demo = true`.
