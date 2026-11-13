# HANDOFF (p4-ai)

## Changed
- `app/driver/page.tsx`: real Supabase writes (contracts ops 4–7). Resumes an active round on reload. Sends one `truck_positions` row every 5 s from `watchPosition`, holds a screen Wake Lock while the round is active, releases both on End round.
- `components/map/data.ts`: shared reads for /driver and /map: `loadStreets`, `loadWaitingStreets`, `loadStops`, `loadActiveRound`, `loadLatestFix`.
- Fallbacks (golden rule): no waiting requests -> round visits every street (shown as "demo"); GPS blocked or on a laptop -> "Simulate the drive" link glides the truck toward the next unserved stop; Supabase unreachable -> yellow "Demo mode" banner, local state only.

- `app/map/page.tsx`: ops 8–9. One Realtime channel: `rounds` (any change -> reload), `truck_positions` INSERT for the active round -> move marker, `round_stops` UPDATE -> flip Served. ETA = `etaMinutes` with `recorded_at`; after 2 min without a fix it shows "(GPS signal lost, estimate)". Street comes from `?street=<id>`, else `localStorage["kot-delo:street_id"]`, else the first street; a small select lets the resident change it.
- `components/map/TruckMap.tsx`: Leaflet map. Mine = blue, next stop = amber, served = grey, truck = 🚚. Fits truck + my street on the first fix.
- Fallback: Supabase unreachable -> "Demo mode" banner and a simulated truck through the mock streets that serves them as it arrives.

### V2 step 16 (demo mode when streets is empty)
- `app/map/page.tsx`, `app/driver/page.tsx`: an empty `streets` table now throws "no streets loaded yet", which lands in the same catch as a Supabase error -> yellow "Demo mode" banner, mock streets, simulated truck. The map reads/writes `localStorage["kotdelo.street"]` (same key Home uses), so the resident's street carries over. "Home" / "← Back" go to `/resident`.

### V2 step 15 (/ops)
- `components/ops/rules.ts`: pure rules, no database. `reservoirTier` (op 12 demo thresholds), `streetStatuses` (op 15: confirmed / unconfirmed / suspect / none over the last 3 h), `priorityList` (op 17: score = hours dry + 12 x waiting, action send tanker / place a static tank / watch). Self-check: `npx tsx components/ops/rules.ts` -> "ops rules ok".
- `components/ops/data.ts`: `loadOps()` reads streets (lib/queries getStreets), hours dry (lib/queries getHoursDry), reservoir_levels (latest Mare aux Vacoas), reports of the last 3 h, waiting requests, open complaints; `resolveComplaint(id)`. Throws when unreachable or `streets` is empty -> page falls back to `demoOps()` (sample data incl. one suspect street and 3 open complaints). These are local stand-ins in P3's shapes: when lib/queries.ts ships ops 12-17, swap the imports.
- `app/ops/page.tsx`: 3-column grid from 1024px (reservoir | heat map x2 / priority x2 | complaints / status x3), one column below. Realtime on `complaints` so a new complaint from /resident shows without refresh. Reservoir card says "sample figure" until `reservoir_levels` has rows. Links to /resident, /map, /driver.
- Visual check: done by reading the grid classes and curl (200), not in a browser (no browser automation on this machine). Please eyeball 390 and 1280 once on the Vercel URL.

## Needs from others
- P3: ops 12, 14, 15, 16, 17 in lib/queries.ts (I will swap my local stand-ins in components/ops/data.ts for them).
- P5/P1: `data/reservoir.csv` loaded into `reservoir_levels` so op 12 is real, not the sample row.
- P2: a complaint button on /resident inserting `complaints {street_id, category}` so the Ops list has real rows.
- P1: Supabase project created, `sql/schema.sql` run, keys in `.env.local` + Vercel. Without them /driver runs in demo mode only.
- P1/P5: `npm run load-data` so `streets` has rows; a round with 0 streets is useless.
- P2 (Home): "I need water" must insert `requests` with status `waiting`, that is what makes the stop list. Link to the map as `/map?street=<street_id>` (the map also reads `localStorage["kot-delo:street_id"]` if you prefer to store it there).
- P1: tick TASKS.md step 5 (P1-only file).

## Blocked
- Real-phone GPS test: needs the https Vercel URL. Not done yet.

## How to test
- Step 15: open /ops with no keys -> yellow demo banner, 35.7% Watch reservoir, 5 mock streets, "Street 3 (mock)" flagged suspect, 3 complaints; Resolve removes one locally. With keys + load-data + seed-demo: real Vacoas streets; tap "I need water" on /resident -> that street's action becomes "send tanker"; file a complaint on /resident -> it appears on /ops live; Resolve -> `complaints.status = 'resolved'`. Reservoir shows "sample figure" until `sql/v2.sql` ran and `reservoir_levels` is loaded.
- Step 16: with keys but before `npm run load-data`, open /map and /driver: both show the yellow demo banner "(no streets loaded yet)" and still work. After load-data they switch to real streets. Pick a street on Home, open /map: the same street is selected.

1. `npm run dev`, open http://localhost:3000/driver. With no `.env.local` you get the yellow "Demo mode" banner and the mock streets; Start / Served / End still work locally.
2. With Supabase keys: on Home tap "I need water" for 2–3 streets, then open /driver: button says "Start round · N stops". Tap it, allow location. Status line shows "Sharing location · sent Xs ago".
3. Supabase Table Editor: `rounds` has one `active` row, `round_stops` has N rows in `order_index` order, `truck_positions` grows by one row every 5 s.
4. Tap Served: `round_stops.served_at` set, the street's `requests.status` = `served`. Tap End round: `rounds.status` = `done`, inserts stop.
5. Reload /driver during a round: it resumes the same round and keeps sending.
6. /map: open http://localhost:3000/map?street=<id of a street in the round> in a second tab (or another phone). The 🚚 jumps every 5 s as the driver moves, the panel says "N stops away, about X min". Tap Served on the driver for a stop before yours: N drops by one. Tap Served on your stop: "Tanker arrived! Served ✓". End round: "No tanker round right now".
7. Supabase: Database -> Replication -> `supabase_realtime` must list truck_positions, round_stops, rounds (sql/schema.sql does this). If the marker never moves, check that first.
8. Note for P1: `next dev` regenerates AGENTS.md (Next 16 `agentRules`). I restored it before committing; set `agentRules: false` in next.config.ts if it keeps changing.

## NEXT-TASK-SPLIT P4 package (Fri 13 Nov evening)
### Changed
- `components/map/LiveMap.tsx` (was TruckMap): one map that fills its container, ResizeObserver -> invalidateSize, layers reliability / reports / notices / tankers, several trucks reused with setLatLng.
- `components/map/layers.ts`: reliability blue scale (grey = unknown), report rings (dashed = unconfirmed, no house pins), notices from the CWA timetable (interruption until next window, expires, hatched). Self-check `npx tsx components/map/layers.ts`.
- `components/map/data.ts`: all active rounds, litres per request (`select("*")`, 20 L assumed until `requests.litres` exists), serve = this stop + requests waiting before the round started only.
- `components/map/demo.ts`: demo data and the demo dispatch hand-off (localStorage) between /ops, /driver, /map.
- `app/map`: bottom panel on phones, side panel from 1024 px, follows the tanker carrying my street.
- `app/driver`: one round per phone (`?round=<id>` or remembered), chooser, new rounds skip streets on other active rounds, litres per stop, failed saves show retry instead of demo mode.
- `app/ops` + `components/ops/{Overview,DispatchPanel,Complaints,Review}.tsx`, `components/ops/dispatch.ts` (planner, self-check `npx tsx components/ops/dispatch.ts`): 4 sections, priority with litres/evidence/reasons, Add to dispatch, preview (120 L / 100 L = 2 loads), grouped complaints with restore + Retry.
### Needs from others
- P3: `POST /api/dispatch` with body `{key, capacity_l, loads:[{tanker, trip, deliveries:[{street_id, litres}]}]}` -> `{rounds:[{round_id, tanker}]}`, idempotent on `key`. Until then live Confirm says the API is not live (demo Confirm works). Also `requests.litres`.
- P5: verified official notices beyond the timetable.
### Not verified
- Live database (no keys here). Browser checks ran in demo mode only. When Supabase is unreachable, demo mode starts after about 7 s of supabase-js retries.

## WATER-DAY-SPLIT P4 (Fri 13 Nov, round 3)
### Changed
- `components/ops/forecast.ts`: op 24/25 shapes + LOCAL STAND-INS (`trendOf` least squares, `forecastFrom` official > every-second-day, `needsTankers` = next window > 36 h or low confidence) and loaders that call P3's API first (`/api/reservoirs`, `/api/reservoirs/trend`, `/api/forecast`) then fall back to real data-file figures. Self-check `npx tsx components/ops/forecast.ts` (MaV: -0.124 %/day, 30% in ~14 days, 20% in ~95 days ≈ mid-Feb).
- `/ops` Overview: reservoir tank row (worst first, stale/missing visible), `components/ops/TrendChart.tsx` (inline SVG: solid readings, dashed projection to the 20% crossing, 30%/20% lines, today line, press "20% by end of November" link shown next to our slower estimate), `components/ops/Forecasts.tsx` (next window per area, Official CWA link vs Estimate chip, confidence, "Plan tankers" flag sorted first). The old single reservoir card is replaced by the tank row.
- `components/ops/Tank.tsx`: LOCAL STAND-IN for P2's `components/ui/level-tank.tsx` (not on main yet). Swap the import in Overview when P2 publishes it.
- `components/ops/Bars.tsx`: `FillBar`, `StopProgress`. Used for priority dry hours, demand vs fleet capacity + litres per load (Dispatch), tankers on the road progress, driver round progress (`app/driver`).
- `/map`: water points layer ("W" squares, nearest to my street larger + labelled, distance in the panel), toggle like the others. Reads table `water_points(name,kind,lat,lng,source_url)`. Demo mode shows 2 points labelled "demo, not a real place"; live shows only sourced rows. No river suggestions (DECISIONS #7).
### Needs from others
- P1: ops 24-27 in contracts/api.md. I built against the shapes in docs/WATER-DAY-SPLIT.md. Note: my `days_to_30/20` count from TODAY, not from latest_day; P3 please match or tell me.
- P3: routes `/api/forecast`, `/api/reservoirs/trend` (falls back today), and a `water_points` table loaded from P5's `data/water_points.csv` (anon read).
- P2: `components/ui/level-tank.tsx`; I will import it instead of my stand-in.
- P5: `data/water_points.csv` with sourced points (layer says "No sourced water points loaded yet" until then).
### How to test
- `npm run build && npx next start`, open /ops (no keys = demo): 7 tanks (MaV 33% Watch first), trend chart "reaches 20% in ~95 days", forecast card. /ops#dispatch: dry bars; Add all -> demand vs capacity bar + per-load bars; Confirm -> tankers on the road with stop progress. /driver: pick Tanker A -> round progress bar. /map: "Tanker stops and water points" layer, nearest highlighted.
### Verified
- Lint, tsc, build, all self-checks pass. Headless Chrome screenshots at 360 (CDP mobile emulation, scrollWidth = 360) and 1440 of /ops, /ops#dispatch, /map in demo mode. Not verified with a live database (no keys here) or the driver progress bar visually.
