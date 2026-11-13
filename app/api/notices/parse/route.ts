// POST {text, url?, save?}  ops only. Reads a pasted notice (CWA / Facebook post copied by ops):
//   Claude (claude-haiku-4-5) -> validated JSON {localities, unmatched_localities, start, end, dates, kind, summary}.
//   Cached by text: the scrape cache (demo-notices.json), the notices table, then this server's memory.
//   No ANTHROPIC_API_KEY or an AI error -> the rule reader, ai_extracted = false, note says why.
//   save = true upserts it into the notices feed (url = the given url, or "paste:<hash>").
import { extractNoticeRules, validateParsedNotice, type ParsedNotice } from "@/lib/queries";
import { db, dbError, handle, HttpError, readJson, requireSession } from "../../_lib/server";
import { aiConfigured, aiReadNotice, knownLocalities, textHash } from "../../_lib/notice-ai";
import cache from "../demo-notices.json";

type Reading = { notice: ParsedNotice; ai_extracted: boolean };
const memory = new Map<string, Reading>();

export const POST = handle(async (req) => {
  await requireSession("ops");
  const b = (await readJson(req)) as Record<string, unknown> | null;
  const text = typeof b?.text === "string" ? b.text.trim() : "";
  if (text.length < 20 || text.length > 20_000) throw new HttpError(400, "invalid_text", { hint: "20 to 20000 characters" });
  const url = typeof b?.url === "string" && b.url.trim() ? b.url.trim() : null;
  if (url && (!/^https?:\/\//.test(url) || url.length > 500)) throw new HttpError(400, "invalid_url");
  const hash = textHash(text);
  const known = knownLocalities();
  const client = db();

  let reading: Reading | null = memory.get(hash) ?? null;
  if (!reading) {
    const hit = cache.notices.find((n) => n.hash === hash);
    if (hit) reading = { notice: hit.parsed as ParsedNotice, ai_extracted: hit.ai_extracted };
  }
  if (!reading) {
    const { data, error } = await client.from("notices")
      .select("localities,start_time,end_time,dates,kind,summary,ai_extracted").eq("raw_text", text).not("summary", "is", null).limit(1).maybeSingle();
    dbError(error);
    if (data) {
      const v = validateParsedNotice({ ...data, start: data.start_time, end: data.end_time }, known);
      if (v.ok) reading = { notice: v.value, ai_extracted: data.ai_extracted };
    }
  }
  const cached = !!reading;

  let note: string | null = null;
  if (!reading) {
    if (aiConfigured()) {
      try {
        const v = validateParsedNotice(await aiReadNotice({ text, publishedOn: new Date().toISOString().slice(0, 10) }), known);
        if (v.ok) reading = { notice: v.value, ai_extracted: true };
        else note = `AI answer rejected (${v.error}); read by rules instead.`;
      } catch (e) {
        console.error("notice AI:", e);
        note = "AI not reachable; read by rules instead.";
      }
    } else note = "AI not configured; read by rules instead.";
    reading ??= { notice: extractNoticeRules(text, known), ai_extracted: false };
    memory.set(hash, reading);
  }

  let savedId: number | null = null;
  if (b?.save === true) {
    const n = reading.notice;
    const key = url ?? `paste:${hash.slice(0, 32)}`;
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await client.from("notices").upsert({
      url: key, published_on: today, source: "ops_paste", raw_text: text,
      localities: n.localities, start_time: n.start, end_time: n.end, dates: n.dates, kind: n.kind, summary: n.summary,
      ai_extracted: reading.ai_extracted, demo: false,
      title: text.split("\n")[0].slice(0, 200), source_url: key, source_date: today,
    }, { onConflict: "url" }).select("id").single();
    dbError(error);
    savedId = data?.id ?? null;
  }
  return Response.json({ ...reading, cached, saved_id: savedId, note });
});
