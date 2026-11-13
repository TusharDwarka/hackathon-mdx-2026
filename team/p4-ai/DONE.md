# DONE (p4-ai)

One line per finished task: what, files, commit hash.

- lib/eta.ts: ETA rule (20 km/h + 10 min/stop, stale GPS fallback) with self-check `npx tsx lib/eta.ts` — 106b4a6
- Step 5 /driver wired to Supabase (ops 4–7): Start round creates rounds + round_stops from waiting requests; watchPosition + 5 s truck_positions insert + Wake Lock; Served updates round_stops + requests; End round closes the round and stops tracking. Fallbacks: no requests -> all streets, no GPS -> simulated drive, no DB -> demo mode. Files: app/driver/page.tsx, components/map/data.ts — (see git log)
- Step 6 /map wired to Supabase Realtime (ops 8–9): truck marker moves on truck_positions inserts; "N stops away, about X min" via lib/eta.ts with the stale-GPS rule; status flips to Served on round_stops update; new/ended rounds reload. Street from ?street=<id> / localStorage / first. Fallback: no DB -> simulated truck. Files: app/map/page.tsx, components/map/TruckMap.tsx — (see git log)
- V2 step 16: /map and /driver enter the same demo mode when `streets` is empty as when Supabase is unreachable; map street key is now `kotdelo.street` (same as Home); Home/Back links go to /resident. Files: app/map/page.tsx, app/driver/page.tsx — (see git log)
- V2 step 15: /ops (desktop first, single column on a phone): reservoir status with tier (op 12), heat map of hours dry reusing components/home/HeatMap (op 11), priority list with suggested action (op 17), open complaints with Resolve + Realtime (op 14), street status with trust and suspect flag (op 15). Pure rules in components/ops/rules.ts with self-check `npx tsx components/ops/rules.ts`. Demo sample when DB is empty/unreachable. Files: app/ops/page.tsx, components/ops/rules.ts, components/ops/data.ts — (see git log)
- Fri 13 Nov: NEXT-TASK-SPLIT P4 steps 1-8 (responsive /map + /driver, map layers, notice overlay, unconfirmed report rings, /ops sections, dispatch preview with litres/loads, multiple drivers, grouped complaints). Self-checks + build + lint pass; demo browser checks at 360-1440 px pass.
- Fri 13 Nov: WATER-DAY-SPLIT P4 items 1-5: ops reservoir tank row, SVG trend chart (op 25, local least-squares fallback), next window per area (op 24, local rule fallback), map water points layer with nearest highlighted, diagram pass (dry bars, load/capacity bars, stop progress on ops + driver). Self-check `npx tsx components/ops/forecast.ts` — (see git log)
- Map legend + one dot per street; 360 px check (no sideways scroll; ops tabs and map link now 44 px)
- Pitch deck: team/p4-ai/slides/deck.html (6 slides, open in a browser, arrows or tap to move)
- Pitch deck as PowerPoint: team/p4-ai/slides/kot-delo.pptx (6 slides, speaker notes)
