# DONE (p2-frontend)

One line per finished task: what, files, commit hash.

- Step 2: street picker (remembered in localStorage) + today's official window card (area, day, start-end, source link), still on mock data. Files: app/page.tsx. Commit b86d14b
- Step 3: one-tap "Water is here" / "No water" buttons insert into reports (op 2), optimistic with logged fallback. Files: app/page.tsx. Commit c686223
- Step 4: "I need water" inserts into requests (op 3); status line per street (waiting / served) read from requests + Realtime. Files: app/page.tsx. Commit 85f0bb3
- SurpriseCard slot: already on Home from the mockup (renders nothing), verified and ticked. Files: components/home/SurpriseCard.tsx, app/page.tsx. Commit 106b4a6
- Step 7: schedule vs reality card, "On time X of Y days" + per-day tick/cross cells, on fake data in the shape of getReliability(). Files: app/page.tsx. Commit 68155c0
- Fix: --font-sans referenced itself so every screen rendered in a serif fallback; now Geist. Files: app/globals.css. Commit 2a19945
- Swap to real data: Home reads streets, window, reliability, hours dry through lib/queries.ts; demo mode on lib/mock.ts when the database is empty or unreachable (4 s timeout). Files: app/page.tsx. Commit 7d262a4
- Step 8: heat map (still Leaflet map + legend + list) of hours since the last water_on report. Files: components/home/HeatMap.tsx, app/page.tsx. Commit 7d262a4
- Loading and empty states on Home (skeletons, choose-your-street, no window, no reports, no history, failed saves). Files: app/page.tsx. Commit 7d262a4
- Design pass (Impeccable polish + Emil motion): blue header, palette tokens, day track, icons, press feedback, eased status lines. Files: app/globals.css, app/layout.tsx, components/ui/button.tsx, components/home/DayTrack.tsx, components/home/time.ts. Commit 7d262a4
- V2 step 1: design tokens (sky gradient, white 24px cards, bright blue accent, surface / chip / icon-btn classes), pill buttons, ProgressRing, shared responsive nav in the layout (bottom tab bar on phones, top bar from 1024px). Checked at 320, 390, 1280px. Files: app/globals.css, app/layout.tsx, components/ui/*. 
- V2 step 2: landing at / (what it is, reservoir ring + supply tier with demo thresholds, today's window, three entries); the old Home moved to /resident in the new look. Checked at 320, 390, 768, 1280px. Screenshots in team/p2-frontend/design/. Files: app/page.tsx, app/resident/page.tsx, components/home/shared.tsx, components/home/rules.ts.
- V2 step 3 (code only, NOT yet checked in a browser): resident status with confirmed / unconfirmed (op 15), likely water time (op 16), complaint in two taps (op 14), one report per street per 30 minutes (localStorage). Files: app/resident/page.tsx, components/home/shared.tsx, components/home/rules.ts.
- V2 step 3 checked in a browser at 320, 390 and 1280px (status with trust, likely time, 30-minute lock incl. reload, complaint, failed saves). Fix: a report sent seconds ago now counts in the status. Files: components/home/rules.ts.
