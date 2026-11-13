# TODO (p2-frontend) — Home screen and visual polish
Branch: feat/home. Own: app/page.tsx, app/layout.tsx, app/globals.css, components/home/*, components/ui/* (shadcn). Mobile-first 390px, English labels only (no Kreol), big tap targets.
Until P3's queries exist, use a small local fake-data object so screens render; swap to the real calls later.

- [x] Step 2: street picker + today's official window (area, day, start-end, source link)
- [x] Step 3: two one-tap buttons "Delo inn vini" / "Pena delo" (insert into reports)
- [x] Step 4: "I need water" button (insert into requests) and its status line (waiting / served)
- [x] Empty `<SurpriseCard />` slot component on Home (renders nothing yet)
- [x] Step 7: schedule vs reality card + reliability score ("on time 4 of 7 days")
- [x] Step 8: heat map of streets (hours since last water_on report)
- [x] Loading and empty states on Home

## V2 (Fri evening, from P1)
- [x] Step 1: design tokens + responsive shell with the shared nav
- [x] Step 2: landing at `/`, Home moved to `/resident`, screenshots in design/
- [x] Step 3: resident status with trust (op 15), likely water time (op 16), complaint in two taps (op 14), one report per street per 30 minutes
- [x] Step 4: database wait 8 s + "Try again"
- [ ] Swap the stand-ins (ops 12, 14, 15, 16) for P3's functions once they are on main
