# Decision log (5-10 key decisions, with times)

| # | Time | Decision | Why |
|---|------|----------|-----|
| 1 | Fri 13 Nov, before 12:30 kickoff | Created a repo with process docs and config ONLY (rules, templates, git hook, prompt notes). No app code, designs or assets. | Team workflow prepared in advance, as the playbook planned. |
| 2 | Fri 13 Nov 12:30 | Made the repo public; added kickoff rules, timeline and README. | Rules require a public repo from 12:30. |
| 3 | Fri 13 Nov 13:46 | Theme Live Better; problem = CWA water rationing ("Kot Delo?"). | Daily pain for many households; real official timetable exists as data. |
| 4 | Fri 13 Nov 13:46 | Web app (Next.js) over native. | Fastest to build and demo in 24h; one link works on any phone. To confirm: organisers accept a URL as the "test link". |
| 5 | Fri 13 Nov 13:46 | Tanker tracked by the driver's phone, not hardware. | No hardware needed; phone GPS + Wake Lock is enough for a demo and for real use. |
| 6 | Fri 13 Nov 13:46 | Dropped leak reporting. | Overlaps CWA's existing KOREK! app; not our fresh angle. |
| 7 | Fri 13 Nov 13:46 | Dropped river water suggestions. | Safety: we should not point people to untreated water. |
| 8 | Fri 13 Nov ~16:50 | Locality: La Caverne, Vacoas (21 streets, area `Vacoas`). | Newest CWA communiqué (10 Oct 2026) names Vacoas; every-second-day supply makes schedule vs reality easy to show. Proposed by P5, adopted when PR #5 was merged. |
| 9 |  | Surprise card handling: | |
| 10 | Fri 13 Nov ~15:00 | UI text in English only, Kreol labels dropped for now. | Avoid broken/awkward Kreol in the demo; can come back after the core works. |
| 11 | Fri 13 Nov night | Accounts: email sign-up/login or guest. Only signed-in users can complain. | Complaints need accountability against spam; reports and requests stay one tap for everyone. No names or profiles stored. |
| 12 | Fri 13 Nov night | Residents no longer choose litres on a request. | A household cannot know tanker capacity; ops plans loads from the number of households asking. |
| 13 | Fri 13 Nov night | Cover all of Mauritius: every locality and named street from OSM, supply rule per locality with its basis. | Users outside Vacoas (L'Escalier, etc.) could not find their place. Unknown stays labelled unknown. |
| 14 | Fri 13 Nov night | "Is my tap water safe to drink?" section: official notices, heavy rain, low reservoir, sourced advice. Never says "safe". | Users asked for it; we can report risk signals and official advice, not certify water. |
| 15 | Fri 13 Nov night | Rivers map layer + "near a river" note (flood / cloudy water after rain). Computed on the phone. | Risk awareness only; #7 still holds: we never suggest river water. |
| 16 | Fri 13 Nov night | AI reads CWA notices (scraped from CWA site/GIS/news, or pasted from Facebook by ops) into localities and times. | Our non-obvious AI use; Facebook is pasted, not scraped (login wall, terms). Results cached and labelled "AI-read". |
