// GET ?locality=&limit=  the notices feed (scraped CWA / news notices + ops pastes), newest first.
// locality keeps notices naming it plus notices with no locality (island-wide or not stated).
// Without the database: the last scrape (demo-notices.json) with demo: true.
// Keeps itself current: after answering, it re-scrapes the sources if this server has not for 3 h.
import { after } from "next/server";
import { foldName, type FeedNotice, type FeedKind } from "@/lib/queries";
import { refreshIfStale } from "../../_lib/notice-refresh";
import { db, dbError, handle, HttpError } from "../../_lib/server";
import cache from "../demo-notices.json";

export const maxDuration = 60;

function forLocality(rows: FeedNotice[], locality: string | null): FeedNotice[] {
  if (!locality) return rows;
  const f = foldName(locality);
  return rows.filter((n) => n.localities.length === 0 || n.localities.some((l) => foldName(l) === f));
}

export const GET = handle(async (req) => {
  const params = new URL(req.url).searchParams;
  const locality = params.get("locality")?.trim() || null;
  const limit = Number(params.get("limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new HttpError(400, "invalid_limit");

  after(() => refreshIfStale()); // runs once the response is sent; never fails the feed

  let rows: FeedNotice[];
  let demo = false;
  try {
    const { data, error } = await db().from("notices")
      .select("id,url,published_on,source,localities,start_time,end_time,dates,kind,summary,ai_extracted,demo")
      .not("summary", "is", null).order("published_on", { ascending: false, nullsFirst: false }).limit(200);
    dbError(error);
    rows = (data ?? []).map((n) => ({
      ...n,
      url: n.url?.startsWith("http") ? n.url : null, // "paste:<hash>" keys are not links
      start_time: n.start_time?.slice(0, 5) ?? null,
      end_time: n.end_time?.slice(0, 5) ?? null,
    })) as FeedNotice[];
    if (!rows.length) throw new HttpError(503, "feed_empty");
  } catch (e) {
    if (!(e instanceof HttpError) || e.status !== 503) throw e;
    demo = true;
    rows = cache.notices.map((n) => ({
      id: null, url: n.url, published_on: n.published_on, source: n.source,
      localities: n.parsed.localities, start_time: n.parsed.start, end_time: n.parsed.end, dates: n.parsed.dates,
      kind: n.parsed.kind as FeedKind, summary: n.parsed.summary, ai_extracted: n.ai_extracted, demo: true,
    }));
  }
  return Response.json({ notices: forLocality(rows, locality).slice(0, limit), demo });
});
