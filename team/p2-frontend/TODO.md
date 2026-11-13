# TODO (p2-frontend) — Home screen and visual polish
Branch: feat/home. Own: app/page.tsx, app/layout.tsx, app/globals.css, components/home/*, components/ui/* (shadcn). Mobile-first 390px, English labels only (no Kreol), big tap targets.
Until P3's queries exist, use a small local fake-data object so screens render; swap to the real calls later.

- [x] Step 2: street picker + today's official window (area, day, start-end, source link)
- [x] Step 3: two one-tap buttons "Delo inn vini" / "Pena delo" (insert into reports)
- [x] Step 4: "I need water" button (insert into requests) and its status line (waiting / served)
- [x] Empty `<SurpriseCard />` slot component on Home (renders nothing yet)
- [ ] Step 7: schedule vs reality card + reliability score ("on time 4 of 7 days")
- [ ] Step 8: heat map of streets (hours since last water_on report)
- [ ] Loading and empty states on Home
