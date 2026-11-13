"use client";

// /ops Complaints: Open / Resolved, filter by category, one card per complaint.
// Resolve asks for confirmation, saves through the ops API, and the resident who filed it (account)
// sees "Resolved" on their phone. If the save fails the complaint stays open with a Retry.
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm";
import { CATEGORY_LABEL, type Category, type Complaint, type OpsData } from "@/components/ops/data";
import { resolveComplaint } from "@/lib/queries";

type StatusFilter = "open" | "resolved";

const ago = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`;
};

type Props = {
  data: OpsData;
  now: number;
  name: (id: number) => string;
  area: (streetId: number) => string;
  setComplaints: (fn: (c: Complaint[]) => Complaint[]) => void;
};

export function Complaints({ data, now, name, area, setComplaints }: Props) {
  const [status, setStatus] = useState<StatusFilter>("open");
  const [category, setCategory] = useState<Category | "all">("all");
  const [failed, setFailed] = useState<Record<number, boolean>>({});

  async function resolve(c: Complaint) {
    const set = (s: Complaint["status"]) => setComplaints((list) => list.map((x) => (x.id === c.id ? { ...x, status: s } : x)));
    set("resolved");
    if (data.demo) return;
    try {
      await resolveComplaint(c.id);
      setFailed((f) => ({ ...f, [c.id]: false }));
    } catch {
      set("open"); // never let a complaint disappear when the save failed
      setFailed((f) => ({ ...f, [c.id]: true }));
    }
  }

  const open = data.complaints.filter((c) => c.status === "open").length;
  const visible = data.complaints.filter((c) => c.status === status && (category === "all" || c.category === category));
  const chip = "chip min-h-11 shrink-0 border aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground";

  return (
    <section className="flex flex-col gap-3">
      <div role="group" aria-label="Status" className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
        {(["open", "resolved"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className="min-h-11 rounded-full text-sm font-semibold text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-card">
            {s === "open" ? `Open (${open})` : "Resolved"}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Category" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")} className={chip}>All</button>
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((k) => (
          <button key={k} type="button" aria-pressed={category === k} onClick={() => setCategory(k)} className={chip}>{CATEGORY_LABEL[k]}</button>
        ))}
      </div>

      {visible.length === 0 && <p className="surface p-5 text-sm text-muted-foreground">{status === "open" ? "No open complaints." : "Nothing resolved in the last 14 days."}</p>}
      <ul className="grid gap-2 md:grid-cols-2">
        {visible.map((c) => (
          <li key={c.id} className="surface flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{CATEGORY_LABEL[c.category]}</p>
              <p className="truncate text-sm">{name(c.street_id)}</p>
              <p className="text-xs text-muted-foreground">{area(c.street_id)}{now ? ` · ${ago(c.created_at, now)}` : ""}</p>
              {failed[c.id] && <p role="alert" className="text-xs text-red-700">Not saved. Still open.</p>}
            </div>
            {c.status === "open" ? (
              <ConfirmButton
                size="lg"
                className="h-11 px-4"
                variant={failed[c.id] ? "default" : "outline"}
                title="Mark as resolved?"
                body={<>{CATEGORY_LABEL[c.category]} on {name(c.street_id)}. If the resident has an account, they see it as resolved in the app.</>}
                confirm="Yes, resolved"
                onConfirm={() => resolve(c)}
              >
                {failed[c.id] ? "Retry" : "Resolve"}
              </ConfirmButton>
            ) : (
              <span className="flex items-center gap-1 text-sm font-medium text-emerald-800"><CheckCircle2 aria-hidden className="size-4" /> Resolved</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
