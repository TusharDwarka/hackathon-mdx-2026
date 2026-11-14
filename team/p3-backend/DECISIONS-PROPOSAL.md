# Decision log proposal (P3, for P1)

Proposed replacement for `docs/DECISIONS.md`. The current file has 16 rows (the rules ask for 5 to 10), six rows only say "Fri 13 Nov night", and row 9 (surprise card) is empty. This version has 10 rows, phrased as questions, with times from the current log and the commit history on main.

P1: copy the table below into `docs/DECISIONS.md` and fill row 10.

## To check before copying
- **Row 10 (surprise card):** the revealed constraint is not written anywhere in the repo, so the row is not filled. It needs the constraint word for word, the time it was revealed, and our one-line answer. The same text goes into `SurpriseCard` (P2) and the README "Surprise card" section (P5), both still empty.
- **Language:** the current log and `CLAUDE.md` say English-only (decided about 15:00 Friday), but a commit at Sat 02:38 added an EN/FR/Kreol switch on every screen. Language is left out here because the record contradicts itself. If the switch stays, it deserves a row.
- **Times on rows 7 to 9:** 22:45 is when the V5 decisions were committed to the docs, not necessarily when the team agreed them.

## The table

# Decision log (10 key decisions, with times)

| # | Time | Question | Decision | Why |
|---|------|----------|----------|-----|
| 1 | Fri 13 Nov, 12:02 (before 12:30 kickoff) | What can we prepare before kickoff? | Process docs and config only (rules, templates, git hook). No app code, designs or assets. Repo made public at 12:30. | Stay inside the rules; the team workflow was ready the moment the clock started. |
| 2 | Fri 13 Nov 13:46 | Which problem do we solve? | Theme Live Better: CWA water rationing and tanker tracking ("Kot Delo?"). | Daily pain for many households; a real official timetable exists as data. |
| 3 | Fri 13 Nov 13:46 | Web app or native app? | Web app (Next.js), mobile-first. | Fastest to build and demo in 24h; one link works on any phone. |
| 4 | Fri 13 Nov 13:46 | How do we track the tanker? | The driver's phone (GPS + Wake Lock), no hardware. | Nothing to buy or install; enough for the demo and for real use. |
| 5 | Fri 13 Nov 13:46 (payments: 17:20) | What do we leave out? | No leak reporting, no river-water suggestions, no payments. | Leaks overlap CWA's KOREK! app; pointing people to untreated water is unsafe; payments add nothing to the demo. |
| 6 | Fri 13 Nov 16:53, widened 22:45 | Which real data, and how far does it reach? | Started with La Caverne, Vacoas (21 streets, real CWA schedule, OSM streets). Then every locality and named street in Mauritius from OSM, with a supply rule per locality and its source. | The newest CWA communiqué (10 Oct 2026) names Vacoas, and every-second-day supply makes schedule vs reality easy to show. Users outside Vacoas could not find their place. Unknown stays labelled unknown. |
| 7 | Fri 13 Nov 22:45 | Who needs an account, and what does a resident enter? | Guests can report and request in one tap; only signed-in users can complain. Residents no longer pick litres (added 18:57, removed 22:45). | Complaints need accountability against spam. A household cannot know tanker capacity, so ops plans loads from the number of households. |
| 8 | Fri 13 Nov 22:45 | Can we tell people their tap water is safe? | No. We show risk signals (official notices, heavy rain, low reservoir) and sourced advice; the app never says "safe". | We can report signals and official advice, not certify water. |
| 9 | Fri 13 Nov 22:45 (built 23:18) | Where does AI earn its place? | AI reads CWA notices into localities and times. Site and news notices are scraped, Facebook ones are pasted by ops. Results are cached, labelled "AI-read", with a rule-based fallback. | Non-obvious AI use on messy official text; Facebook has a login wall and terms; the fallback keeps the demo from breaking. |
| 10 | (time revealed) | How do we build the surprise card in? | (constraint word for word, then our answer and the feature that meets it) | (why this is the smallest change that visibly satisfies it) |
