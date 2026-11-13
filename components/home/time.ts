// Pure time helpers for Home. Self-check: npx tsx components/home/time.ts

/** "05:30" or "05:30:00" -> minutes since midnight */
export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const minOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** 45 -> "45 min", 60 -> "1 h", 130 -> "2 h 10 min" */
export const dur = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

export type WindowStatus = { tone: "soon" | "now" | "over"; label: string };

/** Where "now" sits against the OFFICIAL window. It says what is scheduled, not that water is flowing. */
export function windowStatus(start: string, end: string, nowMin: number): WindowStatus {
  const s = toMin(start), e = toMin(end);
  if (nowMin < s) return { tone: "soon", label: `Due in ${dur(s - nowMin)}` };
  if (nowMin < e) return { tone: "now", label: `Scheduled now · ${dur(e - nowMin)} left` };
  return { tone: "over", label: nowMin === e ? "Window just ended" : `Window ended ${dur(nowMin - e)} ago` };
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("time.ts")) {
  console.assert(toMin("05:30:00") === 330 && toMin("09:00") === 540, "toMin");
  console.assert(dur(45) === "45 min" && dur(60) === "1 h" && dur(130) === "2 h 10 min", "dur");
  console.assert(windowStatus("05:00", "09:00", 170).label === "Due in 2 h 10 min", "before");
  console.assert(windowStatus("05:00", "09:00", 300).tone === "now", "starts on the minute");
  console.assert(windowStatus("05:00", "09:00", 460).label === "Scheduled now · 1 h 20 min left", "during");
  console.assert(windowStatus("05:00", "09:00", 540).label === "Window just ended", "end minute");
  console.assert(windowStatus("05:00", "09:00", 725).label === "Window ended 3 h 5 min ago", "after");
  console.log("time ok");
}
