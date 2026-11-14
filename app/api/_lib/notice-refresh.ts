// Keeps the notices table current with nobody running a script: one scrape of CWA / GIS / news,
// at most every 3 h per server instance. Started by the feed when it is read (after the response)
// and by GET /api/notices/refresh. A notice already stored with the same text is skipped, so
// repeated runs cost nothing (no second AI call).
import { textHash } from "./notice-ai";
import { noticeRow, scrapeNotices } from "./notice-scrape";
import { db, dbError } from "./server";

const EVERY_MS = 3 * 60 * 60 * 1000;
let lastRun = 0;
let running: Promise<RefreshResult> | null = null;

export type RefreshResult = { found: number; updated: number; ai_read: number; ran_at: string };

async function refreshNotices(): Promise<RefreshResult> {
  const client = db();
  const { data, error } = await client.from("notices").select("url,raw_text,ai_extracted").not("url", "is", null).limit(1000);
  dbError(error);
  const seen = new Map((data ?? []).map((n) => [n.url as string, { hash: textHash(n.raw_text ?? ""), ai_extracted: !!n.ai_extracted }]));

  const { found, changed } = await scrapeNotices(seen, { fetchMs: 12_000, budgetMs: 40_000 });
  if (changed.length) dbError((await client.from("notices").upsert(changed.map(noticeRow), { onConflict: "url" })).error);
  return { found, updated: changed.length, ai_read: changed.filter((n) => n.ai_extracted).length, ran_at: new Date().toISOString() };
}

/** Runs a scrape when this server has not run one for 3 h (force: 5 min). Never throws: the feed must not depend on it. */
export async function refreshIfStale(force = false): Promise<RefreshResult | null> {
  if (Date.now() - lastRun < (force ? 5 * 60 * 1000 : EVERY_MS)) return null;
  lastRun = Date.now(); // claim the slot now: a failed run waits 3 h too, it does not hammer the sources
  running ??= refreshNotices().finally(() => { running = null; });
  try {
    return await running;
  } catch (e) {
    console.warn("notices refresh failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
