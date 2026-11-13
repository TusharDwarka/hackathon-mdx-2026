# TODO (p4-ai) — driver page, live map, ETA
Branch: feat/driver-map. Own: app/driver/*, app/map/*, components/map/*, lib/eta.ts. No AI in the core: rule-based ETA only. Leaflet + OpenStreetMap, Supabase Realtime.

- [ ] Step 5: /driver page: "Start round" (creates round + round_stops from waiting requests, ordered by streets.order_index), watchPosition every 5s + Wake Lock, insert truck_positions, "Served" per stop, "End round" stops tracking
- [ ] lib/eta.ts: 20 km/h to the next stop + 10 min per stop before mine; stale GPS (>2 min) falls back to stops remaining x 10 min. Plus a tiny self-check
- [ ] Step 6: /map page: Leaflet map, truck marker moves live (Realtime on truck_positions), "N stops away, about X min", status flips when a stop is served
- [ ] Only track while a round is active; store nothing about people
- [ ] Test on a real phone (GPS needs https: use the Vercel URL)
