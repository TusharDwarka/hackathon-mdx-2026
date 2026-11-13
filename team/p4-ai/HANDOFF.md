# HANDOFF (p4-ai)

## Changed
- `app/driver/page.tsx`: real Supabase writes (contracts ops 4–7). Resumes an active round on reload. Sends one `truck_positions` row every 5 s from `watchPosition`, holds a screen Wake Lock while the round is active, releases both on End round.
- `components/map/data.ts`: shared reads for /driver and /map: `loadStreets`, `loadWaitingStreets`, `loadStops`, `loadActiveRound`, `loadLatestFix`.
- Fallbacks (golden rule): no waiting requests -> round visits every street (shown as "demo"); GPS blocked or on a laptop -> "Simulate the drive" link glides the truck toward the next unserved stop; Supabase unreachable -> yellow "Demo mode" banner, local state only.

- `app/map/page.tsx`: ops 8–9. One Realtime channel: `rounds` (any change -> reload), `truck_positions` INSERT for the active round -> move marker, `round_stops` UPDATE -> flip Served. ETA = `etaMinutes` with `recorded_at`; after 2 min without a fix it shows "(GPS signal lost, estimate)". Street comes from `?street=<id>`, else `localStorage["kot-delo:street_id"]`, else the first street; a small select lets the resident change it.
- `components/map/TruckMap.tsx`: Leaflet map. Mine = blue, next stop = amber, served = grey, truck = 🚚. Fits truck + my street on the first fix.
- Fallback: Supabase unreachable -> "Demo mode" banner and a simulated truck through the mock streets that serves them as it arrives.

## Needs from others
- P1: Supabase project created, `sql/schema.sql` run, keys in `.env.local` + Vercel. Without them /driver runs in demo mode only.
- P1/P5: `npm run load-data` so `streets` has rows; a round with 0 streets is useless.
- P2 (Home): "I need water" must insert `requests` with status `waiting`, that is what makes the stop list. Link to the map as `/map?street=<street_id>` (the map also reads `localStorage["kot-delo:street_id"]` if you prefer to store it there).
- P1: tick TASKS.md step 5 (P1-only file).

## Blocked
- Real-phone GPS test: needs the https Vercel URL. Not done yet.

## How to test
1. `npm run dev`, open http://localhost:3000/driver. With no `.env.local` you get the yellow "Demo mode" banner and the mock streets; Start / Served / End still work locally.
2. With Supabase keys: on Home tap "I need water" for 2–3 streets, then open /driver: button says "Start round · N stops". Tap it, allow location. Status line shows "Sharing location · sent Xs ago".
3. Supabase Table Editor: `rounds` has one `active` row, `round_stops` has N rows in `order_index` order, `truck_positions` grows by one row every 5 s.
4. Tap Served: `round_stops.served_at` set, the street's `requests.status` = `served`. Tap End round: `rounds.status` = `done`, inserts stop.
5. Reload /driver during a round: it resumes the same round and keeps sending.
6. /map: open http://localhost:3000/map?street=<id of a street in the round> in a second tab (or another phone). The 🚚 jumps every 5 s as the driver moves, the panel says "N stops away, about X min". Tap Served on the driver for a stop before yours: N drops by one. Tap Served on your stop: "Tanker arrived! Served ✓". End round: "No tanker round right now".
7. Supabase: Database -> Replication -> `supabase_realtime` must list truck_positions, round_stops, rounds (sql/schema.sql does this). If the marker never moves, check that first.
8. Note for P1: `next dev` regenerates AGENTS.md (Next 16 `agentRules`). I restored it before committing; set `agentRules: false` in next.config.ts if it keeps changing.
