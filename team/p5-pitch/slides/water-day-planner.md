# Slide: The water-day planner (Solution section, right after the live demo starts, ~3:00)

## On the slide

**Title:** Water at 3 a.m. Kot Delo plans your night.

**Centre: one vertical timeline (screenshot of the resident Overview card)**

| Time | |
|---|---|
| 02:30 | ⏰ Reminder: "Water in 30 minutes. Start the pump." |
| 03:00 | 💧 Water arrives: fill the tank first |
| 06:00 | Washing machine |
| 07:30 | Finish the laundry |
| 08:00 | Water ends (official CWA window) |

**Side note (small, right):** The reminder is a calendar alarm (.ics). It rings even with the browser closed. No account, no app install.

**Bottom line (large):** The CWA gives a time. Kot Delo turns it into a plan.

**Footnote (small):** Window: CWA communiqué, 10 Oct 2026, Vacoas 03:00–08:00, every second day. Task times are suggestions.

## Speaker notes (~30 s)
"In Vacoas the water comes every second day from 3 to 8 in the morning. That's the official CWA timetable. Nobody wants to wake up at 3 a.m. and guess. So Kot Delo turns the window into a plan: a reminder at half past two to start the pump, fill the tank first, washing machine at six, laundry done before the water stops at eight. One tap adds the reminder to your phone's calendar, and it rings even if the app is closed."

## Live demo moment (do it, don't just show the slide)
1. Resident → Vacoas → the planner card shows tonight's timeline.
2. Tap **Remind me** → the phone calendar opens with the alarm 30 min before.
3. Tap **Test reminder now** → a notification arrives in 5 s.
Backup if the calendar step fails: show the screenshot on this slide and move on.

## Before the pitch, check on the live site
- [ ] The planner card and both reminder buttons are on main and work on a real phone (P2, WATER-DAY-SPLIT items 2–3). If they're not there, drop the live-demo steps and say "next step" instead of showing them.
- [ ] The times on the slide match what `planDay()` (P3, op 27) prints for 03:00–08:00. Take the screenshot from the live app, not this table.

## Sources (for Q&A, not on the slide)
- Window and rule: [CWA communiqué, 10 Oct 2026](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Press-Notice-09102026.pdf), in `data/schedule.csv`.
- Why fill a tank: CWA Water Tank Grant Scheme (1000 L + 500 L tank + pump, Rs 15,000, from 12 Oct 2026), [CWA PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Tank-poster-2.pdf).
- Why not the hose or the car: CWA (Dry Season) Regulations 2026, GN 141 of 2026 ([PDF](https://cwa.govmu.org/cwa/wp-content/uploads/2026/08/141_CWA-Dry-Season_Reg-2026.pdf)): no washing vehicles or watering gardens with a hosepipe in a wasteful manner. Fine up to Rs 50,000.

## Careful in Q&A
- Task times (06:00 washing machine and so on) are our suggestions, not CWA advice.
- If the CWA changes the timetable, the planner follows the new official window. It never invents one.
