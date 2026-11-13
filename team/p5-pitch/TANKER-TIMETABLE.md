# Tanker timetable at 33 % (V5 P5 item 2), checked Fri 13 Nov 2026

**Result: no official tanker timetable exists.** The CWA doesn't publish when or where tankers come, for any level of Mare-aux-Vacoas. Tankers go out on request and to "difficultés ponctuelles". **Label every tanker time in the app as demo.**

## What is known (sourced)
| Fact | Source |
|---|---|
| Tankers are mobilised "pour répondre aux difficultés ponctuelles dans certaines localités". No times, no list of stops. | [Defimedia, 17 Oct 2026](https://defimedia.info/mare-aux-vacoas-linquietude-persiste-avec-un-taux-de-remplissage-de-344) |
| 31 CWA tankers, 15 for Upper and Lower Mare-aux-Vacoas. Trucks go back to La Marie to refill, which slows replies to requests. 5 private tankers since end of September. | [Defimedia, 29 Oct 2026](https://defimedia.info/crise-hydrique-les-camions-citernes-peinent-repondre-la-demande) (already in `data/context/cwa-tankers-oct-2026.csv`) |
| Private tanker registration: ≥ 5 m³, pump ≥ 1000 L/min, 3 taps. A registration notice, not a timetable. | [CWA notice, Oct 2026](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/WATER-TANKERS-Oct-2026.pdf), [post](https://cwa.govmu.org/cwa/?p=4985) |
| "Des camions-citernes supplémentaires seront déployés" in the regions with supply problems. No schedule. | [Le Mauricien, 28 Oct 2026](https://www.lemauricien.com/actualites/societe/cwa-secheresse-dautres-mesures-durgence-activees-face-a-la-baisse-des-reserves-en-eau/721935/) |
| A roadmap printed by ION News *recommends* "établir un calendrier public de camions-citernes et de points d'eau gratuits". So none exists yet. The roadmap isn't credited to the CWA. | [ION News, 9 Oct 2026](https://ionnews.mu/zero-water-day-le-compte-a-rebours-de-51-jours/) |
| To ask for a tanker: CWA hotline 170, 601 5000, 5500 0025. | [CWA communiqué, 10 Oct 2026](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Press-Notice-09102026.pdf) |

## What changes near 33 %
**No CWA rule is tied to 33 %.** The only level the CWA names is **20 %**: there "la CWA ne pourra plus puiser l'eau de ce réservoir pour alimenter les Plaines Wilhems, le district de Moka et une partie du district de Rivière Noire" ([Defimedia, 25 Sep 2026](https://defimedia.info/mare-aux-vacoas-le-reservoir-pourrait-atteindre-le-seuil-critique-de-20-vers-la-fin-de-novembre)). ION News adds that "22-23 % gêne déjà le pompage" ([9 Oct 2026](https://ionnews.mu/zero-water-day-le-compte-a-rebours-de-51-jours/)), as a news claim, not a CWA rule.
The steps so far were tied to dates, not levels: 17 Jun (Plaines Wilhems / Moka / Black River), 5 Aug (2 h less island-wide), 10 Oct (every second day around Mare-aux-Vacoas).

## Checked, nothing found
- CWA news page [?cat=2](https://cwa.govmu.org/cwa/?cat=2) (all posts Aug to Oct 2026): no tanker timetable.
- CWA private tanker notice (above): registration only.
- GIS: [CWA steps up emergency measures](https://govmu.org/EN/newsgov/SitePages/CWA-steps-up-emergency-measures-to-mitigate-water-shortages.aspx). The page text didn't load (only the headline), so it is unchecked.
- Defimedia, Le Mauricien, ION News, L'Express, ilemaurice.im (Oct to Nov 2026): tankers only in general terms.

## For the app
- Tanker ETA and route are ours (driver phone GPS + `lib/eta.ts`), not CWA's. Say "demo" where a time isn't from a real driver.
- The 30 / 60 % tiers in `reservoirTier` are demo thresholds. The one real level to quote is 20 % (CWA).
