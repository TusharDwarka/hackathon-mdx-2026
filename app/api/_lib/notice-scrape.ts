// Notices scraper core, shared by scripts/scrape-notices.ts (by hand) and /api/notices/refresh (on its own).
// Sources: CWA website (WordPress REST, posts + linked PDFs), GIS, news RSS. Facebook is never
// scraped (login wall + terms): ops paste those posts into /ops instead.
// No file access here, so it runs on Vercel. A notice already read (same url, same text) is skipped.
import { extractNoticeRules, validateParsedNotice, type ParsedNotice } from "@/lib/queries";
import { aiConfigured, aiReadNotice, knownLocalities, textHash } from "./notice-ai";

const UA = { "user-agent": "Mozilla/5.0 (kot-delo-hackathon notices reader; contact via GitHub)" };
const CWA_POSTS = "https://cwa.govmu.org/cwa/?rest_route=/wp/v2/posts&per_page=40&_fields=id,date,link,title,content";
const RSS: { source: string; url: string }[] = [
  { source: "gis", url: "https://gis.govmu.org/?feed=rss2" },
  { source: "news", url: "https://defimedia.info/rss.xml" },
  { source: "news", url: "https://lemauricien.com/feed/" },
];

// A notice is kept when it is about supply, cuts, tankers, quality or reservoirs; job ads and tenders are not.
const TOPIC = /coupure|interruption|distribution|horaire|approvisionnement|supply|bouillir|boil|qualite|quality|camion|citerne|tanker|reservoir|niveau|robinet|pression/;
const WATER = /\beau\b|water|\bcwa\b|citerne|robinet/;
export const NOT_NOTICE = /vacanc|vacancy|tender|expression of interest|appel d offres|recrutement|bid|procurement|annual report/;

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
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, " ");
const isoDay = (d: string | null) => {
  const t = d ? new Date(d) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toISOString().slice(0, 10) : null;
};

async function get(url: string, ms: number): Promise<Response | null> {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
    if (r.ok) return r;
    console.warn(`  ${url}: HTTP ${r.status}`);
  } catch (e) {
    console.warn(`  ${url}: ${e instanceof Error ? e.message : e}`);
  }
  return null;
}

async function cwaPosts(ms: number): Promise<Item[]> {
  const r = await get(CWA_POSTS, ms);
  if (!r) return [];
  const posts = (await r.json()) as { date: string; link: string; title: { rendered: string }; content: { rendered: string } }[];
  return posts.map((p) => {
    const pdf = /href="(https:\/\/cwa\.govmu\.org\/cwa\/wp-content\/uploads\/[^"]+\.pdf)"/i.exec(p.content.rendered)?.[1] ?? null;
    return { url: p.link, published_on: isoDay(p.date), source: "cwa", title: decode(p.title.rendered), text: decode(p.content.rendered), pdf };
  });
}

async function rss(source: string, url: string, ms: number): Promise<Item[]> {
  const r = await get(url, ms);
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

/** AI reading when there is a key and `aiMs` of time for it; otherwise (or on any failure) the rule reader. */
async function read(i: Item, known: string[], fetchMs: number, aiMs: number): Promise<{ parsed: ParsedNotice; ai: boolean }> {
  const text = noticeText(i).slice(0, 8000);
  if (aiConfigured() && aiMs >= 5000) {
    try {
      const ai = (async () => {
        let pdf: Buffer | undefined;
        if (i.pdf) {
          const r = await get(i.pdf, fetchMs);
          const buf = r ? Buffer.from(await r.arrayBuffer()) : null;
          if (buf && buf.length < 8_000_000) pdf = buf;
        }
        return aiReadNotice({ text, publishedOn: i.published_on, pdf });
      })();
      ai.catch(() => {}); // if it loses the race below, its own failure is not an unhandled rejection
      const late = new Promise<never>((_, no) => setTimeout(() => no(new Error("out of time")), aiMs).unref?.());
      const v = validateParsedNotice(await Promise.race([ai, late]), known);
      if (v.ok) return { parsed: v.value, ai: true };
      console.warn(`  AI result rejected (${v.error}) for ${i.url}: rule reader used`);
    } catch (e) {
      console.warn(`  AI failed for ${i.url} (${e instanceof Error ? e.message : e}): rule reader used`);
    }
  }
  return { parsed: extractNoticeRules(text, known), ai: false };
}

/**
 * One scrape. `seen` = what is already stored, by url (hash of its text, and whether the AI read it).
 * Returns the water notices found and, in `changed`, only the new or changed ones with their reading.
 * `budgetMs` bounds the whole run (a serverless function has a time limit): once it is nearly spent,
 * the remaining notices get the rule reader and the AI reads them on a later run.
 */
export async function scrapeNotices(
  seen: Map<string, { hash: string; ai_extracted: boolean }>,
  opts: { fetchMs?: number; budgetMs?: number } = {}
): Promise<{ found: number; changed: CachedNotice[] }> {
  const fetchMs = opts.fetchMs ?? 30_000;
  const until = Date.now() + (opts.budgetMs ?? 600_000);
  const known = knownLocalities();
  const items = (await Promise.all([cwaPosts(fetchMs), ...RSS.map((s) => rss(s.source, s.url, fetchMs))])).flat()
    .filter((i) => i.url.startsWith("http") && relevant(i));

  const changed: CachedNotice[] = [];
  for (const i of items) {
    const raw_text = `${noticeText(i)}${i.pdf ? `\nPDF: ${i.pdf}` : ""}`.slice(0, 8000);
    const hash = textHash(raw_text);
    const prev = seen.get(i.url);
    if (prev && prev.hash === hash && (prev.ai_extracted || !aiConfigured())) continue; // unchanged: keep the stored reading
    const { parsed, ai } = await read(i, known, fetchMs, until - Date.now());
    changed.push({ hash, url: i.url, published_on: i.published_on, source: i.source, raw_text, parsed, ai_extracted: ai });
  }
  return { found: items.length, changed };
}

/** A scraped notice as a `notices` table row (upsert on url). */
export const noticeRow = (n: CachedNotice) => ({
  url: n.url, published_on: n.published_on, source: n.source, raw_text: n.raw_text,
  localities: n.parsed.localities, start_time: n.parsed.start, end_time: n.parsed.end, dates: n.parsed.dates,
  kind: n.parsed.kind, summary: n.parsed.summary, ai_extracted: n.ai_extracted, demo: false,
  title: n.raw_text.split("\n")[0].slice(0, 200), source_url: n.url, source_date: n.published_on,
});
