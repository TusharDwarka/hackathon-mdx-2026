// V5 notices scraper (docs/SPLIT-V5.md, P3 item 5). Run by hand, not at runtime:
//   npx tsx scripts/scrape-notices.ts                                        (cache file only, rule reader)
//   node --env-file=.env.local --import tsx scripts/scrape-notices.ts        (+ AI reader + Supabase `notices`)
// Sources: CWA website (WordPress REST, posts + linked PDFs), GIS, news RSS. Facebook is never
// scraped (login wall + terms): ops paste those posts into /ops instead.
// Writes app/api/notices/demo-notices.json: the feed + parser cache the app uses when the database
// or the AI key is missing, so the demo never depends on a live call. Dedupe by url.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { extractNoticeRules, validateParsedNotice, type ParsedNotice } from "../lib/queries";
import { aiConfigured, aiReadNotice, knownLocalities, textHash } from "../app/api/_lib/notice-ai";

const CACHE = "app/api/notices/demo-notices.json";
const UA = { "user-agent": "Mozilla/5.0 (kot-delo-hackathon notices reader; contact via GitHub)" };
const CWA_POSTS = "https://cwa.govmu.org/cwa/?rest_route=/wp/v2/posts&per_page=40&_fields=id,date,link,title,content";
const RSS: { source: string; url: string }[] = [
  { source: "gis", url: "https://gis.govmu.org/?feed=rss2" },
  { source: "news", url: "https://defimedia.info/rss.xml" },
  { source: "news", url: "https://lemauricien.com/feed/" },
];
const MAX_ITEMS = 40;

// A notice is kept when it is about supply, cuts, tankers, quality or reservoirs; job ads and tenders are not.
const TOPIC = /coupure|interruption|distribution|horaire|approvisionnement|supply|bouillir|boil|qualite|quality|camion|citerne|tanker|reservoir|niveau|robinet|pression/;
const WATER = /\beau\b|water|\bcwa\b|citerne|robinet/;
const NOT_NOTICE = /vacanc|vacancy|tender|expression of interest|appel d offres|recrutement|bid|procurement|annual report/;

export type CachedNotice = {
  hash: string; url: string; published_on: string | null; source: string; raw_text: string;
  parsed: ParsedNotice; ai_extracted: boolean;
};
type Item = { url: string; published_on: string | null; source: string; title: string; text: string; pdf: string | null };

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, " ");
const isoDay = (d: string | null) => {
  const t = d ? new Date(d) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toISOString().slice(0, 10) : null;
};

async function get(url: string, ms = 30_000): Promise<Response | null> {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
    if (r.ok) return r;
    console.warn(`  ${url}: HTTP ${r.status}`);
  } catch (e) {
    console.warn(`  ${url}: ${e instanceof Error ? e.message : e}`);
  }
  return null;
}

async function cwaPosts(): Promise<Item[]> {
  const r = await get(CWA_POSTS);
  if (!r) return [];
  const posts = (await r.json()) as { date: string; link: string; title: { rendered: string }; content: { rendered: string } }[];
  return posts.map((p) => {
    const pdf = /href="(https:\/\/cwa\.govmu\.org\/cwa\/wp-content\/uploads\/[^"]+\.pdf)"/i.exec(p.content.rendered)?.[1] ?? null;
    return { url: p.link, published_on: isoDay(p.date), source: "cwa", title: decode(p.title.rendered), text: decode(p.content.rendered), pdf };
  });
}

async function rss(source: string, url: string): Promise<Item[]> {
  const r = await get(url, 20_000);
  if (!r) return [];
  const xml = await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const tag = (t: string) => decode(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(it)?.[1] ?? "");
    return { url: tag("link"), published_on: isoDay(tag("pubDate")), source, title: tag("title"), text: tag("description"), pdf: null };
  });
}

/** Title + body, without the body repeating the title (RSS descriptions often start with it). */
const noticeText = (i: Item) => (fold(i.text).startsWith(fold(i.title)) ? i.text : `${i.title}\n${i.text}`);

function relevant(i: Item): boolean {
  const t = fold(`${i.title} ${i.text}`);
  if (NOT_NOTICE.test(t) || !TOPIC.test(t)) return false;
  return i.source === "cwa" || WATER.test(t);
}

async function read(i: Item, known: string[]): Promise<{ parsed: ParsedNotice; ai: boolean }> {
  const text = noticeText(i).slice(0, 8000);
  if (aiConfigured()) {
    try {
      let pdf: Buffer | undefined;
      if (i.pdf) {
        const r = await get(i.pdf);
        const buf = r ? Buffer.from(await r.arrayBuffer()) : null;
        if (buf && buf.length < 8_000_000) pdf = buf;
      }
      const v = validateParsedNotice(await aiReadNotice({ text, publishedOn: i.published_on, pdf }), known);
      if (v.ok) return { parsed: v.value, ai: true };
      console.warn(`  AI result rejected (${v.error}) for ${i.url}: rule reader used`);
    } catch (e) {
      console.warn(`  AI failed for ${i.url} (${e instanceof Error ? e.message : e}): rule reader used`);
    }
  }
  return { parsed: extractNoticeRules(text, known), ai: false };
}

async function main() {
  const known = knownLocalities();
  const old = existsSync(CACHE) ? (JSON.parse(readFileSync(CACHE, "utf8")) as { notices: CachedNotice[] }).notices : [];
  const byUrl = new Map(old.filter((n) => !NOT_NOTICE.test(fold(n.raw_text))).map((n) => [n.url, n]));

  console.log("Fetching CWA posts, GIS and news feeds...");
  const items = [...(await cwaPosts()), ...(await Promise.all(RSS.map((s) => rss(s.source, s.url)))).flat()]
    .filter((i) => i.url.startsWith("http") && relevant(i));
  console.log(`${items.length} water notices found. AI reader: ${aiConfigured() ? "on" : "off (no ANTHROPIC_API_KEY): rule reader"}`);

  for (const i of items) {
    const raw_text = `${noticeText(i)}${i.pdf ? `\nPDF: ${i.pdf}` : ""}`.slice(0, 8000);
    const hash = textHash(raw_text);
    const prev = byUrl.get(i.url);
    if (prev && prev.hash === hash && (prev.ai_extracted || !aiConfigured())) continue; // unchanged: keep the cached reading
    const { parsed, ai } = await read(i, known);
    byUrl.set(i.url, { hash, url: i.url, published_on: i.published_on, source: i.source, raw_text, parsed, ai_extracted: ai });
    console.log(`  ${ai ? "AI " : "rules"} ${i.published_on ?? "????-??-??"} ${i.source} ${parsed.kind}: ${parsed.summary.slice(0, 80)}`);
  }

  const notices = [...byUrl.values()].sort((a, b) => (b.published_on ?? "").localeCompare(a.published_on ?? "")).slice(0, MAX_ITEMS);
  writeFileSync(CACHE, JSON.stringify({ scraped_on: new Date().toISOString().slice(0, 10), notices }, null, 1) + "\n");
  console.log(`Wrote ${CACHE} (${notices.length} notices).`);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("No Supabase keys: notices table not updated (run with --env-file=.env.local).");
    return;
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await db.from("notices").upsert(
    notices.map((n) => ({
      url: n.url, published_on: n.published_on, source: n.source, raw_text: n.raw_text,
      localities: n.parsed.localities, start_time: n.parsed.start, end_time: n.parsed.end, dates: n.parsed.dates,
      kind: n.parsed.kind, summary: n.parsed.summary, ai_extracted: n.ai_extracted, demo: false,
      title: n.raw_text.split("\n")[0].slice(0, 200), source_url: n.url, source_date: n.published_on,
    })),
    { onConflict: "url" }
  );
  if (error) throw error;
  console.log(`Upserted ${notices.length} rows into notices.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
