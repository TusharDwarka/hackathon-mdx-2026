# DONE (p2-frontend)

One line per finished task: what, files, commit hash.

- Step 2: street picker (remembered in localStorage) + today's official window card (area, day, start-end, source link), still on mock data. Files: app/page.tsx. Commit b86d14b
- Step 3: one-tap "Water is here" / "No water" buttons insert into reports (op 2), optimistic with logged fallback. Files: app/page.tsx. Commit c686223
- Step 4: "I need water" inserts into requests (op 3); status line per street (waiting / served) read from requests + Realtime. Files: app/page.tsx. Commit 85f0bb3
- SurpriseCard slot: already on Home from the mockup (renders nothing), verified and ticked. Files: components/home/SurpriseCard.tsx, app/page.tsx. Commit 106b4a6
- Step 7: schedule vs reality card, "On time X of Y days" + per-day tick/cross cells, on fake data in the shape of getReliability(). Files: app/page.tsx. Commit 68155c0
- Fix: --font-sans referenced itself so every screen rendered in a serif fallback; now Geist. Files: app/globals.css. Commit 2a19945
