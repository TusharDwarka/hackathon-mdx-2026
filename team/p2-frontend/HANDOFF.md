# HANDOFF (p2-frontend)

## Changed
- Home is on REAL data now (`lib/queries.ts`): streets + area (picker), today's window (op 1), reports (op 2), requests (op 3), reliability (op 10), hours dry (op 11).
- Demo mode (golden-rule fallback): if the database does not answer in 4 s, errors, or `streets` is empty, Home runs on `lib/mock.ts` with an amber "Demo mode" banner. Taps still answer, nothing is saved. Today that is what the live site shows, because the tables are empty.
- First visit: the picker says "Choose your street" and a card explains what the app does. The choice is remembered in `localStorage["kotdelo.street"]`.
- Window card: big start-end time, a status line ("Due in 2 h", "Scheduled now · 1 h left", "Window ended 3 h ago"), and a 24 h track that draws the official window, today's neighbour reports for the street and "now". Below it: "Today on <street>: N reports of water, M reports of no water". No window today -> a plain message.
- Reports: two toggle buttons. A failed save now says "Your report was not sent" and undoes the tap (before it pretended to work). Your own report shows on the track and the heat map at once.
- "I need water": turns into a "Tanker requested" card linking to `/map?street=<id>`; flips to "Served" through Realtime on `requests`. A failed save says so.
- Step 8 heat map: a still Leaflet map (drag and zoom off, so it does not trap scrolling) with one dot per street coloured by hours since the last "Water is here" report, a colour legend, and the same data as a list. Your street has a dark ring.
- Loading skeletons for every card; empty states for no street, no window today, no reports today, no reliability history.
- Look: water-blue header, tinted background, new colour tokens in `app/globals.css` (this also turns the primary buttons on /driver blue), icons from lucide-react, press feedback on buttons (`components/ui/button.tsx`: scale on press instead of `transition-all`, new `size="tap"`), status lines ease in, visible focus ring, `theme-color` for the phone browser bar.
- New files: `components/home/DayTrack.tsx`, `components/home/HeatMap.tsx`, `components/home/time.ts`.
- One read is written inline in `app/page.tsx` because `lib/queries.ts` has no function for it: today's reports for a street (`getTodayReports`). P3 may move it.

## Needs from others
- P5 / P1: `data/streets.csv` + `data/schedule.csv` and `npm run load-data`. Until then Home is in demo mode on the live site.
- P3: `npm run seed-demo` after the load, including a few `water_on` rows for today, or the heat map has no green and the day track is empty.
- P4: Home links to `/map?street=<id>`, which your map already reads. Home stores the street under `kotdelo.street`; your map stores `kot-delo:street_id`. P1 asked for `kotdelo.street` on both.
- P1: the "Served" flip needs Realtime on `requests` (it is in `sql/schema.sql`). Not tested against the real database yet.

## Blocked
- Nothing in code. A real end-to-end test needs the CSVs loaded.

## How to test
- `npx tsx components/home/time.ts` -> `time ok`. `npm run lint`, `npm run build` pass.
- `npm run dev`, open http://localhost:3000 at 390px width.
- Without data: after about 4 s the amber "Demo mode" banner shows. Choose "Street 3 (mock)": window 05:00 – 09:00, "On time 4 of 7 days", heat map with 5 dots.
- With data: no banner. Choose a street -> its window, reliability and today's reports. Tap "No water": the button fills red with a tick, the count under the track goes up by one, and a row appears in `reports`. Tap "Water is here": your street turns green on the heat map.
- Tap "I need water": a blue "Tanker requested" card replaces the button; tapping it opens `/map?street=<id>`. A row with status `waiting` is in `requests`. Set it to `served` in the table editor: Home shows the green "Served" line without a reload.
- Turn the network off and tap a report: "Your report was not sent. Check your connection and tap again."
