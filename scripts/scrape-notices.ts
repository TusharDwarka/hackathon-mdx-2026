// V5 notices scraper (docs/SPLIT-V5.md, P3 item 5), by hand. The app also runs the same scrape by
// itself (app/api/_lib/notice-refresh.ts); this script is for refreshing the committed cache file.
//   npx tsx scripts/scrape-notices.ts                                        (cache file only, rule reader)
//   node --env-file=.env.local --import tsx scripts/scrape-notices.ts        (+ AI reader + Supabase `notices`)
// Sources and rules: app/api/_lib/notice-scrape.ts.
// Writes app/api/notices/demo-notices.json: the feed + parser cache the app uses when the database
// or the AI key is missing, so the demo never depends on a live call. Dedupe by url.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { aiConfigured } from "../app/api/_lib/notice-ai";
import { fold, NOT_NOTICE, noticeRow, scrapeNotices, type CachedNotice } from "../app/api/_lib/notice-scrape";

const CACHE = "app/api/notices/demo-notices.json";
const MAX_ITEMS = 40;

async function main() {
  const old = existsSync(CACHE) ? (JSON.parse(readFileSync(CACHE, "utf8")) as { notices: CachedNotice[] }).notices : [];
  const byUrl = new Map(old.filter((n) => !NOT_NOTICE.test(fold(n.raw_text))).map((n) => [n.url, n]));

  console.log("Fetching CWA posts, GIS and news feeds...");
  const { found, changed } = await scrapeNotices(byUrl);
  console.log(`${found} water notices found. AI reader: ${aiConfigured() ? "on" : "off (no ANTHROPIC_API_KEY, no AI_BASE_URL + AI_API_KEY + AI_MODEL): rule reader"}`);
  for (const n of changed) {
    byUrl.set(n.url, n);
    console.log(`  ${n.ai_extracted ? "AI " : "rules"} ${n.published_on ?? "????-??-??"} ${n.source} ${n.parsed.kind}: ${n.parsed.summary.slice(0, 80)}`);
  }

  const notices = [...byUrl.values()].sort((a, b) => (b.published_on ?? "").localeCompare(a.published_on ?? "")).slice(0, MAX_ITEMS);
  writeFileSync(CACHE, JSON.stringify({ scraped_on: new Date().toISOString().slice(0, 10), notices }, null, 1) + "\n");
  console.log(`Wrote ${CACHE} (${notices.length} notices).`);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("No Supabase keys: notices table not updated (run with --env-file=.env.local).");
    return;
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await db.from("notices").upsert(notices.map(noticeRow), { onConflict: "url" });
  if (error) throw error;
  console.log(`Upserted ${notices.length} rows into notices.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
