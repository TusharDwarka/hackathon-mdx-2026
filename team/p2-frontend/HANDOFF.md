# HANDOFF (p2-frontend)

## V2 step 1 (done): design tokens + responsive shell. P4 can build on this now.
- `app/layout.tsx` renders the shared nav (`components/ui/app-nav.tsx`) on every screen: a floating rounded tab bar at the bottom on phones (Home, Resident, Map, Operations), a top bar from 1024px. Do not add your own nav or "Back / Home" links.
- The nav takes space: `--nav-h` (5.75rem under the page on phones, 4rem above it from 1024px). The layout already pads normal pages. A full-height page (the map) must use `h-[calc(100dvh-var(--nav-h))]` instead of `h-dvh`, or its bottom panel hides behind the tab bar.
- Look (in `app/globals.css`): sky-blue gradient behind everything, bright blue `primary`, dark navy text. Use these classes instead of `border bg-white rounded-xl`:
  - `surface` = white card, 24px corners, soft shadow (add your own padding, e.g. `surface p-5`). Put all text on one.
  - `chip` = pill; active pill: `chip bg-primary text-primary-foreground`.
  - `icon-btn` = round 48px icon button.
  - `shadow-card`, `rounded-3xl`, `ease-snap` also exist as plain utilities.
- `components/ui/button.tsx`: buttons are pills now; `size="tap"` is the big 56px one.
- `components/ui/progress-ring.tsx`: `<ProgressRing value={41} label="Reservoir 41% full" className="text-primary">41%</ProgressRing>` for the reservoir on /ops.
- Layout rule for pages: one column on phones (`mx-auto w-full max-w-md px-4`), wider from 1024px (`lg:max-w-6xl lg:px-6`, grids with `lg:grid-cols-…`). Nothing may scroll sideways at any width.
- Keep emerald for water / on time, red for no water / late, amber for demo.

## Not done yet (next steps)
- Step 2: the current Home is still at `/`. It moves to `/resident`; `/` becomes the landing.
- Step 3: resident V2 features (status with trust, likely water time, complaint, 30-minute report limit).
- Step 4: database wait 8 s + "Try again".

## Needs from others
- P4: `app/map/page.tsx` uses `h-dvh` and `max-w-[390px]`; switch to `h-[calc(100dvh-var(--nav-h))]`. `/ops` is in the nav already and 404s until your page is merged. Links to Home should go to `/resident` after my step 2.
- P3: ops 12, 14, 15, 16 in `lib/queries.ts`. I use local stand-ins in the same shapes until they are on main.

## How to test
- `npm run dev`, open `/`, `/driver`, `/map` at 390px: tab bar floats at the bottom, the current tab is blue, nothing scrolls sideways.
- Same at 1280px: top bar with "Kot Delo?" on the left and the four links on the right.
