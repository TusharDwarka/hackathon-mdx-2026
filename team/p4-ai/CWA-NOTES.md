# CWA data: key points for Kot Delo?

Sources: `data/sources/cwa-horaires-2026-08-05.pdf`, `data/sources/cwa-communique-2026-10-10.pdf`, `data/context/cwa-branches.csv`. Only what the demo needs.

## 1. Island-wide timetable (from 5 Aug 2026, "until further notice")
Supply is cut to 2 h/day less than before. Two daily slots per region:

| Region | Window | Morning | Afternoon |
|---|---|---|---|
| North | 06:00-20:00 | 04:00-07:00 | 16:00-19:00 |
| East | 06:00-20:00 | 04:00-07:00 | 16:00-19:00 |
| South | 06:00-20:00 | 05:00-08:00 | 17:00-19:00 |
| Port-Louis | 08:00-20:00 | 04:00-08:00 | 16:00-20:00 |

- Plaines Wilhems, Moka and part of Rivière Noire keep the harsher restrictions in force since **17 Jun 2026**. The Aug table does NOT apply to them.

## 2. Vacoas / Curepipe communiqué (10 Oct 2026): our demo area
- Applies to Vacoas, Phoenix, St Pierre, Curepipe, Forest-Side, Floréal. All are served by the **Mare-aux-Vacoas reservoir**.
- Supply is **03:00-08:00** (one 5 h slot).
- **Vacoas, Phoenix, St Pierre:** every second day, starting Sat 10 Oct.
- **Curepipe, Forest-Side, Floréal:** also every second day. The poster says "Tous les deux jours" and starts Sun 11 Oct, so they run on the opposite days from the first group. The bottom label on the poster is ambiguous, so treat this as an assumption (see "Gaps").
- Reason given: fair sharing of Mare-aux-Vacoas water.
- CWA hotlines: **6015000, 170, 55000025**.

## 3. Branch locations (`cwa-branches.csv`)
8 branches with lat/lng (Port Louis x2, Pamplemousses, Centre de Flacq, St Paul HQ, Rose Hill, Rose Belle, Souillac). Useful for a "nearest CWA office" link. Rose Hill and St Paul HQ are closest to our area.

## 4. What this means for the app
- **Resident:** the "next supply" countdown works from 03:00-08:00 plus the alternate-day rule, not from a fixed weekly table.
- **Tanker/driver:** tankers matter most on the **off days**, and for areas where the 5 h slot is not enough.
- **Ops forecast:** Mare-aux-Vacoas level drives both groups. Rationing was tightened in Jun, Aug and Oct 2026. The trend is getting worse, which is the story for the pitch.
- **Reliability:** 5 h/day every other day is about 2.5 h/day on average. The old 9 h/day (Jun 2026) was cut to 5-6 h.

## Gaps and assumptions
- Curepipe/Forest-Side/Floréal day parity is inferred from the poster (starts 11 Oct). Verify before showing in the demo.
- `schedule.csv` only has Vacoas dates. Phoenix, Curepipe etc. are not in it yet (P5/P3 task).
- The PDFs have no street-level detail. Street data comes from OSM.
