# DONE (p4-ai)

One line per finished task: what, files, commit hash.

- lib/eta.ts: ETA rule (20 km/h + 10 min/stop, stale GPS fallback) with self-check `npx tsx lib/eta.ts` — 106b4a6
- Step 5 /driver wired to Supabase (ops 4–7): Start round creates rounds + round_stops from waiting requests; watchPosition + 5 s truck_positions insert + Wake Lock; Served updates round_stops + requests; End round closes the round and stops tracking. Fallbacks: no requests -> all streets, no GPS -> simulated drive, no DB -> demo mode. Files: app/driver/page.tsx, components/map/data.ts — (see git log)
