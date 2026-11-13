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
- [x] Swap the stand-ins (ops 12, 14, 15, 16) for P3's functions once they are on main (op 12 now uses the real CSV figure)

## Next split (docs/NEXT-TASK-SPLIT.md, P2 package)
- [x] 1. Translucent shell: `glass` utility on the nav, opaque fallback, reduced motion
- [x] 2. Sections/tabs: Overview, Water schedule, Report/request, Reservoirs, News/advisories + search
- [x] 3. "Continue as guest" flow (needs P3 session API) + distinct Driver entry
- [x] 4. Locality first, street only when needed
- [x] 5. Request litres + pending/served (needs P3)
- [x] 6. Searchable reservoir view (needs P5/P3 data)
- [x] 7. Short transitions polish

## Water-day split (docs/WATER-DAY-SPLIT.md, P2)
- [x] 1. Reservoir tank diagram `components/ui/level-tank.tsx` (landing + Reservoirs tab; P4 imports it)
- [x] 2. Water-day planner, top of Overview (sample day labelled when no locality)
- [x] 3. Reminders: Add to calendar (.ics, VALARM 30 min before) + in-tab alert + "Test reminder now (5 s)"
- [x] 4. Next water forecast card (op 24 shape; stand-in until P3)
- [x] 5. Water quality card (op 26 shape; stand-in until P3)
- [x] 6. Save water + nearby help (reads data/water_points.csv when P5 adds it)
- [x] 7. Diagram pass: tanks, report split bar, litres vs tanker bar
- [x] SurpriseCard shell with props { title, body, href }: waiting for P1's text (DECISIONS #9)
- [ ] Swap stand-ins in components/home/water-day.ts for P3's planDay / forecastNext / waterQuality when on main
