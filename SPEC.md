# SPEC — Kot Delo? (P1 only edits)

**One-line pitch:** For a household in [LOCALITY], Mauritius, Kot Delo? shows when water will really come during CWA rationing, and where the tanker truck is right now, using the official timetable, neighbour reports and the driver's phone location, unlike waiting at home with no information.

Theme: **Live Better** (cost of living / everyday services / daily routines).

## User and problem
- User: one household in [LOCALITY] (TBD: pick the locality; it decides which timetable and streets we load).
- Problem: during CWA water rationing, households don't know when water will really come, or when the tanker truck will arrive. Official windows are often not met and there is no live information.
- Hard numbers for the problem slide: TBD (CWA / Statistics Mauritius / news).

## Demo story (3 minutes)
1. Resident opens the app, picks their street, sees today's official CWA water window (real timetable).
2. Resident taps "Pena delo", then "I need water".
3. Driver opens /driver, taps "Start round". Stops = streets with waiting requests, in order.
4. Resident's map shows the truck moving live and "3 stops away, about 35 min".
5. Driver taps "Served" at each stop; the resident's status updates live.
6. Resident sees schedule vs reality: official window, neighbour reports, reliability score, and a heat map of hours without water.

**WOW moment:** steps 4-5, the truck moving live toward the resident's street, ETA counting down, status flipping to served.

## Screens (3 only: Home, Map, Driver. No login, no admin, no settings)
| # | Screen | Purpose | Data |
|---|--------|---------|------|
| 1 | Home (/) | Street picker, today's official window, one-tap reports, "I need water", schedule-vs-reality card, reliability score, heat map, empty `<SurpriseCard />` slot | schedule, streets, reports, requests |
| 2 | Map (/map) | Truck marker live (Supabase Realtime), stops away, ETA | rounds, round_stops, truck_positions |
| 3 | Driver (/driver) | Start round, live location every 5s, mark stop served, End round | rounds, round_stops, truck_positions |

## V2 scope (Fri 17:30) — this section wins over "3 screens only" above
One responsive app (phone first, must also work on desktop), five screens, still no login:
| # | Screen | Purpose |
|---|--------|---------|
| 1 | Landing (/) | What Kot Delo? is, area status (reservoir level + supply tier, today's window), three ways in: Resident, Driver, CWA operations |
| 2 | Resident (/resident) | The old Home, plus: confirmed / unconfirmed water status, likely water time, complaint in two taps |
| 3 | Map (/map) | Unchanged |
| 4 | Driver (/driver) | Unchanged |
| 5 | Operations (/ops, desktop first) | Reservoir status, heat map, priority list with a suggested action per street, open complaints, suspect reports |

Rules for all of it are in `contracts/api.md`, "V2 additions". Nothing else is in scope.

## ETA rule
Travel time at 20 km/h to the next stop + 10 min per stop before mine. If GPS is stale (>2 min), fall back to stops remaining x 10 min.

## Where AI is used
Not in the core. A simple rule-based ETA and reliability score beat a model that doesn't work. AI is used to BUILD the app (see README). Optional extra only if approved: AI communiqué parser.

## Status of each feature
- REAL: official CWA timetable (/data/schedule.csv, with source_url + source_date), streets (/data/streets.csv), live truck location from the driver's phone, requests, reports.
- DEMO DATA: 7 days of seeded reports, `is_demo = true`, stated in the README.
- FAKED / NOT BUILT: auth (anyone can open /driver), real tanker hardware (driver's phone is the tracker), SurpriseCard content (slot only until the card is revealed), crowd "kamion spotted" fallback, water points map, AI communiqué parser.
- DROPPED on purpose: leak reporting (overlaps CWA's KOREK!), river water suggestions (safety).

## Privacy and ethics
Reports and requests are stored by street, never by house or person. Only the truck is tracked, only while a round is active. No individual is identified or profiled.

## Impact and business
- Who benefits: households under rationing in [LOCALITY]; scalable to every CWA rationing area.
- Who runs it: CWA, a local council or an NGO; cost = a free-tier web app. TBD: refine for the pitch.
- Reaches users: link/QR shared by the council, WhatsApp groups, tanker drivers.

## Open items
- [LOCALITY] not chosen. `/data/schedule.csv` and `/data/streets.csv` must exist before building.
- Deliverable: rules want an Android APK or Expo/test link; we chose a web app. Confirm with organisers that a public URL counts as a "test link".
- Surprise card: not revealed yet.
