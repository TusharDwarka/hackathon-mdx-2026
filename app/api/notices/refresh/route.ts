// GET  one scrape of CWA / GIS / news into the notices table (see _lib/notice-refresh.ts).
// The feed already triggers this by itself when it is read. This route is for a scheduler
// (Vercel cron, GitHub Action, uptime pinger) so notices stay current even when nobody opens the app.
// It only reads public pages and skips notices already stored. ?force=1 shortens the 3 h spacing to 5 min.
import { refreshIfStale } from "../../_lib/notice-refresh";
import { handle } from "../../_lib/server";

export const maxDuration = 60;

export const GET = handle(async (req) => {
  const force = new URL(req.url).searchParams.get("force") === "1";
  const result = await refreshIfStale(force);
  return Response.json(result ?? { skipped: true });
});
