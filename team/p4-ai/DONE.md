# DONE (p4-ai)

One line per finished task: what, files, commit hash.

- lib/eta.ts: ETA rule (20 km/h + 10 min/stop, stale GPS fallback) with self-check `npx tsx lib/eta.ts` — 106b4a6
- Step 5 /driver wired to Supabase (ops 4–7): Start round creates rounds + round_stops from waiting requests; watchPosition + 5 s truck_positions insert + Wake Lock; Served updates round_stops + requests; End round closes the round and stops tracking. Fallbacks: no requests -> all streets, no GPS -> simulated drive, no DB -> demo mode. Files: app/driver/page.tsx, components/map/data.ts — (see git log)
- Step 6 /map wired to Supabase Realtime (ops 8–9): truck marker moves on truck_positions inserts; "N stops away, about X min" via lib/eta.ts with the stale-GPS rule; status flips to Served on round_stops update; new/ended rounds reload. Street from ?street=<id> / localStorage / first. Fallback: no DB -> simulated truck. Files: app/map/page.tsx, components/map/TruckMap.tsx — (see git log)
