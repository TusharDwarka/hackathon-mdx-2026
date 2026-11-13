# HANDOFF (p2-frontend)

## Changed
- Step 3 (app/page.tsx only): "Water is here" / "No water" buttons now insert into `reports` (op 2: `{street_id, type}`) with the anon Supabase client, inline in the page. The tapped button gets a tick and a ring, the line below says what was reported and for which street. Tapping the same answer twice does not insert twice. Changing street clears the message.
- The insert is optimistic: if it fails (no Supabase project yet, mock street ids) the UI still says thanks and the error goes to the browser console as `report not saved: ...`. So today nothing is actually saved.
- Step 2 (earlier): street picker remembers the street in `localStorage["kotdelo.street"]` (street id); window card shows area, today's date (Mauritius time), start-end, source link.
- Still on `lib/mock.ts` for streets and the window. The yellow MOCKUP banner stays until the swap.

## Needs from others
- P1: Supabase project + `.env.local` / Vercel env vars (task 1b). Until then every report insert fails silently.
- P3: `lib/queries.ts` with (a) streets list incl. area name, (b) op 1 today's window for a street's area, same shapes as the `Street` / `Window` types in lib/mock.ts; return `null` when there is no window today. If you also ship an op 2 function, tell me and I swap the inline insert for it (one line).
- P4: /map hard-codes `MY_STREET = MOCK_STREETS[2]`. Read `localStorage["kotdelo.street"]` (street id as a string) instead so "my street" matches what the resident picked on Home.

## Blocked
- Real streets + real window: blocked on data/schedule.csv, data/streets.csv and lib/queries.ts.
- Reports really landing in the table: blocked on the Supabase project (1b) and real street ids.

## How to test
- `npm run dev`, open http://localhost:3000 at 390px width.
- Window card shows "Mock Village · <today's date>", "05:00 – 09:00", and a source link.
- Tap "No water": the button shows a tick, the line reads `Thanks! Reported "No water" for Street 3 (mock).` In DevTools > Network there is one POST to `/rest/v1/reports` with `{"street_id":3,"type":"water_off"}` (it fails until Supabase is set up; once it is, check the row in the `reports` table).
- Tap "No water" again: no second POST. Tap "Water is here": one more POST with `water_on`.
- Pick another street: the thanks line clears. Reload: the same street is still selected.
