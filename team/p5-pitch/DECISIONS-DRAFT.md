# Decision log draft (10 entries, for P1 to copy into docs/DECISIONS.md)

The current docs/DECISIONS.md has 16 rows, but the rules ask for 5 to 10. This version merges or drops the smaller ones. Times come from the git commits that recorded each decision.

| # | Time | Decision | Why |
|---|------|----------|-----|
| 1 | Fri 13 Nov 12:45 | Made the repo public at kickoff, starting from a process-only starter kit (rules, templates, no app code). | Rules require a public repo with commits from kickoff. |
| 2 | Fri 13 Nov 13:46 | Theme Live Better: "Kot Delo?", for CWA water rationing plus live tanker tracking. | Daily pain for many Mauritian households, and the official CWA timetable gives us real data. |
| 3 | Fri 13 Nov 13:46 | Web app (Next.js) instead of a native app. | Fastest to build and demo in 24h. One link works on any phone. |
| 4 | Fri 13 Nov 13:46 | The tanker is tracked by the driver's phone, with no hardware. | Phone GPS plus Wake Lock is enough for the demo and for real use. Costs nothing. |
| 5 | Fri 13 Nov 13:46 | Dropped leak reporting and river water suggestions. | Leaks: CWA's KOREK! app already covers them. Rivers: safety, because we never point people to untreated water. |
| 6 | Fri 13 Nov 15:24 | UI text in English only. Kreol labels dropped for now. | Avoids broken or awkward Kreol in the demo. Can come back once the core works. |
| 7 | Fri 13 Nov 16:54 | Demo locality: La Caverne, Vacoas (21 streets). | The newest CWA communiqué (10 Oct 2026) names Vacoas, and supply every second day makes schedule vs reality easy to show. Proposed by P5. |
| 8 | Fri 13 Nov 22:45 | Cover all of Mauritius: every OSM locality and named street, each with a supply rule and its source. | Users outside Vacoas could not find their place. When we do not know a rule, the app says "unknown". |
| 9 | Fri 13 Nov 22:45 | AI reads CWA notices (scraped from the CWA site and news, or pasted from Facebook by ops) and turns them into localities and times. | This is our non-obvious AI use. Facebook is pasted, not scraped (login wall, terms). Results are cached and labelled "AI-read". |
| 10 | Sat 14 Nov __:__ | Surprise card: ______ | ______ (fill in when revealed) |

## Merged or dropped from the 16-row version
- Old #1 and #2 are merged into #1. Old #6 and #7 are merged into #5.
- Left out as smaller details: #11 (email or guest accounts, only signed-in users can complain), #12 (no litres on a request), #14 (tap-water safety section), #15 (rivers map layer). If the surprise card stays empty, put #11 back as row 10.
