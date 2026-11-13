# Slide: What after? (Impact section, ~7:00 in the pitch)

## On the slide

**Title:** What after? Kot Delo tells the CWA where each fix should go.

**Subtitle:** Mare aux Vacoas at 33% on 5 Nov 2026, with 20% forecast for the end of November. The fixes exist. The question is *where first*.

| Ops priority list says | The fix | Already happening (real) |
|---|---|---|
| **"Send tanker"**: street has waiting "I need water" requests | **More tankers** | CWA is registering private tankers: min. 5 m³, 3 taps, Oct 2026 |
| **"Place a static tank"**: street dry for more than 48 h | **Static tanks** | Water Tank Grant Scheme: 1000 L + 500 L tank + pump, Rs 15,000, from 12 Oct 2026 |
| Same streets dry week after week on the heat map | **Boreholes** (beyond the app) | Minister seeking 15–20 more boreholes (24 Oct 2026). One at Valentina gives 4,840 m³/day |

**Bottom line (large):** Priority score = hours dry + 12 × waiting requests. Rule-based, explainable, works from day one.

**Footnote (small):** Priority list in the demo runs on seeded reports (`is_demo`). The rule and the CWA programmes are real.

## Speaker notes (~45 s)
"The government is already doing the right things: more tankers, a tank for every home, new boreholes. But today nobody knows which street needs which one first. Our operations screen turns neighbour reports into a priority list. A street with people waiting gets a tanker. A street that's been dry for two days gets a static tank. And streets that stay red on the heat map week after week are the evidence for where the next borehole connection matters. The score is a simple rule anyone at the CWA can check. In the demo it runs on seeded reports. With real reports it works from day one."

## Sources (for Q&A, not on the slide)
- Reservoir 33% on 5 Nov 2026: `data/reservoir.csv` → [Defimedia, 6 Nov 2026](https://defimedia.info/eau-les-principaux-reservoirs-remplis-496-les-fournisseurs-reclament-une-revision-de-la-subvention). 20% by end of Nov forecast (WRC): [Defimedia, 21 Oct 2026](https://defimedia.info/mare-aux-vacoas-pourrait-atteindre-20-fin-novembre)
- Private tankers (official): [CWA, Registration of Private Water Tankers, Oct 2026](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/WATER-TANKERS-Oct-2026.pdf)
- Tank grant (official): [CWA communiqué, 10 Oct 2026](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Tank-poster-2.pdf)
- Boreholes (news, no official release found): [Rio Times, 25 Oct 2026](https://www.riotimesonline.com/mauritius-boreholes-water-crisis-2026/): 15–20 more boreholes sought, Valentina 4,840 m³/day since 19 Oct. The same article reports a Cabinet package for Upper Plaines-Wilhems: water tankers, 14 more boreholes, 10 reservoirs of 30,000 L.
- Priority rule: `contracts/api.md`, op 17.

## Careful in Q&A
- Don't say Kot Delo *decides* where boreholes go. Say it gives *evidence* of where supply fails most.
- The app never says water is safe or unsafe to drink.
- The thresholds (48 h, ×12) are our demo choices. A real CWA would tune them.
