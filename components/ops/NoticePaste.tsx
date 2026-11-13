"use client";

// Ops: "Paste a CWA notice" (docs/SPLIT-V5.md P4 5). Staff paste a notice or a Facebook post (never scraped),
// P3's parser reads it (Claude when ANTHROPIC_API_KEY is set, else the rule reader), staff check the preview,
// then Publish puts it in the residents' notices feed. The second call is cached, so no second AI call.
// Fallback (no ops session / no database): the same rule reader runs here; Publish is then disabled.
import { useState } from "react";
import { Bot, CalendarDays, Clock, MapPin, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { ApiError, AI_NOTICE_LABEL, extractNoticeRules, loadPlaces, parseNotice, type ParsedNotice } from "@/lib/queries";

// Real example: the key lines of the CWA communiqué of 10 Oct 2026 (data/sources/cwa-communique-2026-10-10.pdf).
const SAMPLE = `Nouveaux horaires de distribution d'eau pour les régions de Vacoas, Phoenix, St. Pierre, Curepipe, Forest-Side et Floréal. La distribution d'eau se fera tous les deux jours, de 03h00 à 08h00, à partir du samedi 10 octobre 2026 pour Vacoas, Phoenix et St Pierre, et à partir du dimanche 11 octobre 2026 pour Curepipe, Forest-Side et Floréal.`;
const SAMPLE_URL = "https://cwa.govmu.org/cwa/?p=5001";

type Result = { notice: ParsedNotice; ai: boolean; cached: boolean; note: string | null; offline: boolean };
const day = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function NoticePaste() {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"read" | "publish" | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<number | null>(null);

  const read = async () => {
    setError(null);
    setPublished(null);
    if (text.trim().length < 20) return setError("Paste the full notice (at least 20 characters).");
    if (url.trim() && !/^https?:\/\//.test(url.trim())) return setError("The source link must start with http:// or https://");
    setBusy("read");
    try {
      const r = await parseNotice(text.trim(), url.trim() || undefined, false);
      setRes({ notice: r.notice, ai: r.ai_extracted, cached: r.cached, note: r.note, offline: false });
    } catch (e) {
      console.warn("notice parser not reachable, reading on this page:", e);
      try {
        const known = [...new Set((await loadPlaces()).filter((p) => p.l === p.n).map((p) => p.n))];
        const why = e instanceof ApiError && (e.code === "session_required" || e.code === "forbidden") ? "Sign in as CWA staff to use the AI reader and publish." : "The AI reader is not reachable right now.";
        setRes({ notice: extractNoticeRules(text.trim(), known), ai: false, cached: false, note: why, offline: true });
      } catch {
        setError("Could not read the notice. Check your connection.");
      }
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (!res || res.offline) return;
    setBusy("publish");
    setError(null);
    try {
      const r = await parseNotice(text.trim(), url.trim() || undefined, true);
      setPublished(r.saved_id ?? 0);
    } catch (e) {
      setError(e instanceof ApiError && e.code === "migration_missing" ? "Publishing needs sql/v5.sql in Supabase." : "Not published. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const n = res?.notice;
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <section className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card" aria-labelledby="paste-title">
        <h2 id="paste-title" className="text-lg font-bold">Paste a CWA notice</h2>
        <p className="-mt-2 text-sm text-muted-foreground">AI reads the places, dates and times. Check, then publish.</p>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Notice text
          <textarea value={text} onChange={(e) => { setText(e.target.value); setRes(null); setPublished(null); }} rows={7} placeholder="Paste the notice here (French or English)" className="rounded-xl border bg-background p-3 text-base font-normal" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Source link <span className="font-normal text-muted-foreground">(optional)</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cwa.govmu.org/…" className="h-11 rounded-xl border bg-background px-3 text-base font-normal" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="tap" onClick={read} disabled={busy !== null}>
            <Sparkles aria-hidden /> {busy === "read" ? "Reading…" : "Read notice"}
          </Button>
          <Button size="tap" variant="secondary" onClick={() => { setText(SAMPLE); setUrl(SAMPLE_URL); setRes(null); setPublished(null); }}>Try the 10 Oct notice</Button>
        </div>
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card" aria-labelledby="preview-title" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="preview-title" className="text-lg font-bold">Preview</h2>
          {res && (
            <span className={`chip min-h-7 px-2.5 text-xs ${res.ai ? "bg-violet-100 text-violet-900" : "bg-muted"}`}>
              {res.ai ? <><Bot aria-hidden className="size-3.5" /> Read by AI (Claude){res.cached ? " · cached" : ""}</> : "Read by rules (no AI)"}
            </span>
          )}
        </div>
        {!n ? (
          <p className="text-sm text-muted-foreground">Paste a notice and tap Read notice.</p>
        ) : (
          <>
            <p className="text-sm font-medium">{n.summary}</p>
            <dl className="grid gap-2 text-sm">
              <div className="flex gap-2"><dt className="flex w-24 shrink-0 items-center gap-1.5 text-muted-foreground"><MapPin aria-hidden className="size-4" />Places</dt>
                <dd>{n.localities.length ? n.localities.join(", ") : "None matched"}{n.unmatched_localities.length > 0 && <span className="block text-xs text-amber-800">Not on our list (not placed on the map): {n.unmatched_localities.join(", ")}</span>}</dd></div>
              <div className="flex gap-2"><dt className="flex w-24 shrink-0 items-center gap-1.5 text-muted-foreground"><CalendarDays aria-hidden className="size-4" />Dates</dt>
                <dd>{n.dates.length ? n.dates.map(day).join(", ") : "Not stated"}</dd></div>
              <div className="flex gap-2"><dt className="flex w-24 shrink-0 items-center gap-1.5 text-muted-foreground"><Clock aria-hidden className="size-4" />Times</dt>
                <dd className="tabular-nums">{n.start ? `${n.start}${n.end ? ` – ${n.end}` : ""}` : "Not stated"}</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0 pl-5.5 text-muted-foreground">Kind</dt><dd className="capitalize">{n.kind}</dd></div>
            </dl>
            {res.ai && <p className="text-xs text-violet-900">{AI_NOTICE_LABEL}</p>}
            {res.note && <p className="text-xs text-muted-foreground">{res.note}</p>}
            {published !== null ? (
              <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">Published. Residents in {n.localities.join(", ") || "every area"} see it under Notices.</p>
            ) : (
              <ConfirmButton size="tap" onConfirm={publish} disabled={busy !== null || res.offline} title="Publish this notice?" body={<>Residents in {n.localities.join(", ") || "every area"} will see it under Notices.</>} confirm="Yes, publish">
                <Send aria-hidden /> {busy === "publish" ? "Publishing…" : "Publish to residents"}
              </ConfirmButton>
            )}
          </>
        )}
      </section>
    </div>
  );
}
