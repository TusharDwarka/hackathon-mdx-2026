// V5 AI notice parser (docs/SPLIT-V5.md, P3 item 6). SERVER ONLY: uses ANTHROPIC_API_KEY.
// Sends a CWA / news notice (text, optionally its PDF) to Claude and gets back JSON
// {localities[], start, end, dates[], kind, summary}. The caller validates it with
// validateParsedNotice (lib/queries.ts) and caches the result: the demo never needs a live call.
// Plain fetch on purpose: package.json is P1's; swap for @anthropic-ai/sdk when P1 adds it.
import { createHash } from "node:crypto";
import { FEED_KINDS, type Place } from "@/lib/queries";
import places from "@/public/places.json";

export const NOTICE_MODEL = "claude-haiku-4-5";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["localities", "start", "end", "dates", "kind", "summary"],
  properties: {
    localities: { type: "array", items: { type: "string" }, description: "Every town, village or area named as affected, spelled as in the notice." },
    start: { anyOf: [{ type: "string" }, { type: "null" }], description: "Start time of the water supply or cut, 24 h HH:MM, or null if not stated." },
    end: { anyOf: [{ type: "string" }, { type: "null" }], description: "End time, 24 h HH:MM, or null if not stated." },
    dates: { type: "array", items: { type: "string", format: "date" }, description: "Each date the notice applies to, YYYY-MM-DD. Empty if none is stated." },
    kind: { type: "string", enum: FEED_KINDS },
    summary: { type: "string", description: "One plain English sentence, at most 25 words." },
  },
};

const SYSTEM = `You read public notices from the Central Water Authority of Mauritius and local news about water supply.
They are in French, English or Mauritian Creole. Extract what the notice states for residents:
- localities: the places affected, as written.
- start / end: supply hours or interruption hours in 24 h HH:MM ("de 3h à 8h" -> "03:00" and "08:00").
- dates: the dates it applies to. Use the publication date to fill in a missing year.
- kind: interruption (a cut or works), rationing (a supply timetable, e.g. every second day), advisory (water quality, boiling, saving water), other.
- summary: one short plain English sentence a resident understands.
Only use what the notice says. If something is not stated, use null or an empty list. Never guess a time, date or place.`;

/** True when the server can call Claude. */
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

/**
 * One Claude call. Returns the raw JSON object (validate it before use), or throws.
 * `pdf` = the notice PDF bytes when the text is only a link to it.
 */
export async function aiReadNotice(input: { text: string; publishedOn?: string | null; pdf?: Buffer }): Promise<unknown> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ai_not_configured");
  const content: unknown[] = [];
  if (input.pdf) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdf.toString("base64") } });
  content.push({ type: "text", text: `Published: ${input.publishedOn ?? "unknown"}\n\nNotice:\n${input.text}` });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: NOTICE_MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = (await res.json().catch(() => ({}))) as { stop_reason?: string; content?: { type: string; text?: string }[]; error?: { type?: string; message?: string } };
  if (!res.ok) throw new Error(`ai_http_${res.status}: ${body.error?.type ?? ""} ${body.error?.message ?? ""}`.trim());
  if (body.stop_reason !== "end_turn") throw new Error(`ai_stop_${body.stop_reason}`);
  const text = body.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("ai_empty");
  return JSON.parse(text);
}

export const textHash = (text: string) => createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex");

let knownCache: string[] | null = null;
/** Locality names of all Mauritius (public/places.json entries where l === n). */
export function knownLocalities(): string[] {
  knownCache ??= [...new Set((places as Place[]).filter((p) => p.l === p.n).map((p) => p.n))];
  return knownCache;
}
