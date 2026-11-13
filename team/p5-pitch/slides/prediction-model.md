# Slide: The prediction model (How it works section, ~5:30 in the pitch)

## On the slide

**Title:** When will water come, and how long will it last?

**Left column: inputs (all sourced)**
1. **Official CWA timetable:** Vacoas 03:00–08:00, every second day since 10 Oct 2026 (CWA communiqué)
2. **The every-second-day rule:** when the timetable runs out, we repeat it
3. **Reservoir trend:** WRC readings for all 7 reservoirs, Aug to Nov 2026
4. **Neighbour reports:** when water really arrived on your street

**Right column: outputs**
- **Next window:** "Sun 15 Nov, 03:00–08:00 · Official CWA" (or "Estimate · every second day")
- **Days to 20%:** Mare aux Vacoas at 33% (5 Nov) → falling ~0.13 points a day → 20% in **~12 weeks (early Feb 2027)** · *Estimate*

**Bottom line (large):** An estimate, never a promise. Every number says what it is based on, and the official CWA window always wins.

**Footnote (small):** Trend = straight line through the last 60 days of WRC readings. The press (21 Oct) quoted the CWA forecast of 20% by the end of November. Our line is slower. We show both.

## Speaker notes (~30 s, the "why an estimate" part)
"Kot Delo always starts from the official CWA timetable. When that runs out, we use the CWA's own rule, water every second day, and we label it *Estimate*. For the reservoir, we draw a straight line through the last two months of official readings. Today it says Mare aux Vacoas reaches 20% in about twelve weeks. The CWA said end of November. Rain, new boreholes or tighter rationing all change the line, so we never call it a promise. We show what it's based on and how confident it is, and the official window always overrides it."

## Numbers behind the slide (recompute before the pitch)
Computed Fri 13 Nov from `data/reservoir.csv` + `data/reservoir_levels.csv`, merged the way `scripts/load-data.ts` does (data_date beats article_date). Least-squares line over each reservoir's readings from the last 60 days before its latest reading:

| Reservoir | Latest | Slope (pts/day) | Days to 30% | Days to 20% |
|---|---|---|---|---|
| Mare aux Vacoas | 33% (5 Nov) | −0.135 | ~10 | ~84 |
| La Ferme | 33.7% (30 Oct) | −0.220 | ~5 | ~51 |
| La Nicoliere | 43.7% (5 Nov) | −0.072 | ~143 | ~282 |
| Bagatelle Dam | 55.8% (30 Oct) | −0.262 | ~87 | ~125 |
| Piton du Milieu | 67.9% (30 Oct) | −0.337 | ~99 | ~129 |
| Midlands Dam | 70.4% (30 Oct) | −0.289 | ~127 | ~162 |
| Mare Longue | 71.7% (30 Oct) | −0.232 | ~169 | ~212 |

"Days" are counted from Fri 13 Nov 2026. Those days are counted from the fitted line, not from the last reading, so "days to 30%" can look short when the last reading is already near 30%.

**Use the number the live ops chart shows** (P3's op 25) if it differs from this table, and say which window it uses. Never put two different numbers on screen.

## Sources (for Q&A, not on the slide)
- Timetable + every-second-day rule: [CWA communiqué, 10 Oct 2026](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Press-Notice-09102026.pdf) ("La distribution d'eau se fera tous les deux jours"). Copy in `data/sources/`.
- Reservoir readings: WRC figures quoted by L'Express/allAfrica (14 Aug, 4 Sep), ION News (18 Sep, 16 Oct, 30 Oct), Defimedia (5 Nov). One URL per row in `data/reservoir.csv`.
- "20% by end of November": [Defimedia, 21 Oct 2026](https://defimedia.info/mare-aux-vacoas-pourrait-atteindre-20-fin-novembre).

## Careful in Q&A
- "Is this AI?" No. It's a straight line and a calendar rule. Anyone at the CWA can check it. That's on purpose.
- "Why not end of November like the CWA?" Our line uses only published readings. The CWA may know about cuts to supply or extraction that we don't. We show their figure next to ours.
- Don't say "Mare aux Vacoas will hit 20% on 5 Feb". Say "about 12 weeks if nothing changes".
- The reservoir level never says whether tap water is safe to drink.
