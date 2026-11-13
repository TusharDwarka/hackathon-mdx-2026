# HANDOFF (p2-frontend)

## Changed
- Step 2 (app/page.tsx only): street picker now remembers the chosen street in `localStorage["kotdelo.street"]` (street id). Window card shows area, today's date (Mauritius time), start-end as HH:MM, and the source link opens in a new tab.
- Still on `lib/mock.ts` (lib/queries.ts and the CSVs do not exist yet). The yellow MOCKUP banner stays until the swap.

## Needs from others
- P3: `lib/queries.ts` with (a) streets list incl. area name, (b) op 1 today's window for a street's area. Same shapes as the `Street` / `Window` types in lib/mock.ts so the swap is an import change. Return `null` when there is no window today.
- P4: /map hard-codes `MY_STREET = MOCK_STREETS[2]`. Read `localStorage["kotdelo.street"]` (street id as a string) instead so "my street" matches what the resident picked on Home.

## Blocked
- Real window + real streets: blocked on data/schedule.csv, data/streets.csv and lib/queries.ts.

## How to test
- `npm run dev`, open http://localhost:3000 at 390px width.
- Window card shows "Mock Village · <today's date>", "05:00 – 09:00", and a source link.
- Pick another street, reload the page: the same street is still selected.
