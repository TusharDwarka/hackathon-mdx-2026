# HANDOFF (p2-frontend)

## Changed
- Step 7 (app/page.tsx only): "Schedule vs reality" card shows "On time X of Y days" plus one cell per day (tick = neighbours reported water inside the official window, cross = late or no water, weekday under it). Data is FAKE for now (`fakeReliability()` in app/page.tsx, street 3 = 4 of 7, later streets worse) but in the exact shape of P3's `getReliability()`, so the swap is one line.
- Step 4 (app/page.tsx only): "I need water" inserts into `requests` (op 3: `{street_id}`, status defaults to 'waiting'). The status line below it shows the latest request for the selected street from the last 24h: "Waiting for the tanker · <street> → see it live" (links to /map, button disabled) or "Served · the tanker has delivered to <street>" (button usable again).
- Status is per STREET, not per phone (privacy rule: no person/house). If a neighbour already requested, you see "Waiting" too and cannot add a second request for the same street.
- Home subscribes to Realtime on `requests` filtered by `street_id`; any insert/update re-reads the status, so it should flip to "Served" when the driver serves the stop (op 6). NOT tested against a real Supabase yet (none exists); the read, insert and both status lines were tested against a fake REST server.
- Step 3: "Water is here" / "No water" insert into `reports` (op 2). Step 2: street remembered in `localStorage["kotdelo.street"]`, window card with area, date, start-end, source link.
- Fallback for both inserts: optimistic. If Supabase is unreachable the UI still answers and the error goes to the browser console (`report not saved` / `request not saved`). In that case "Waiting" is lost on reload.
- Streets and the window still come from `lib/mock.ts`. The yellow MOCKUP banner stays until the swap.

## Needs from others
- P1: Supabase project + `.env.local` / Vercel env vars (task 1b). Until then nothing is saved and nothing flips live.
- P4: op 6 must set `requests.status = 'served'` for the stop's `street_id` (the contract already says so). That UPDATE is what flips Home to "Served". Also: /map hard-codes `MY_STREET = MOCK_STREETS[2]`; read `localStorage["kotdelo.street"]` (street id as a string) instead.
- P1: merge `feat/data` into main. P3's `lib/queries.ts` (getStreets, getTodayWindow, postReport, postRequest, getReliability, getHoursDry) is ready there; once it is on main I swap Home off `lib/mock.ts` and the fake reliability in one task.

## Blocked
- Real streets, window and reliability: blocked on data/schedule.csv, data/streets.csv, and `lib/queries.ts` reaching main.
- Rows really landing and the live "Served" flip: blocked on the Supabase project (1b) and real street ids.

## How to test
- `npm run dev`, open http://localhost:3000 at 390px width.
- Window card shows "Mock Village · <today's date>", "05:00 – 09:00", and a source link.
- Tap "No water": tick on the button, line reads `Thanks! Reported "No water" for Street 3 (mock).` One POST to `/rest/v1/reports` in DevTools > Network; a second tap sends nothing.
- Tap "I need water": the button greys out and a blue "Waiting for the tanker · Street 3 (mock) → see it live" card appears; tapping it opens /map. One POST to `/rest/v1/requests` with `{"street_id":3}`.
- Once Supabase exists: in the table editor set that request's `status` to `served` → Home shows the green "Served" line without a reload, and the button works again.
- "Schedule vs reality" shows "On time 4 of 7 days" for Street 3 with 7 cells ending yesterday; Street 5 shows 2 of 7.
- Pick another street: both lines clear. Reload: the same street is still selected.
