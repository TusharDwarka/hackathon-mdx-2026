"use client";

// /ops Complaints (op 14, P4 step 8): filter by status and category, group by category, street, area or
// status, with counts and expandable records. Resolve is optimistic; if the save fails the complaint
// comes back as open with a Retry button instead of vanishing.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABEL, setComplaintStatus, type Category, type Complaint, type OpsData } from "@/components/ops/data";
import { groupComplaints } from "@/components/ops/rules";

type GroupBy = "category" | "street" | "area" | "status";
type StatusFilter = "open" | "resolved" | "all";

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
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [category, setCategory] = useState<Category | "all">("all");
  const [pending, setPending] = useState<Record<number, "saving" | "failed">>({});

  async function resolve(c: Complaint) {
    const set = (s: Complaint["status"]) => setComplaints((list) => list.map((x) => (x.id === c.id ? { ...x, status: s } : x)));
    set("resolved");
    if (data.demo) return;
    setPending((p) => ({ ...p, [c.id]: "saving" }));
    try {
      await setComplaintStatus(c.id, "resolved");
      setPending((p) => { const next = { ...p }; delete next[c.id]; return next; });
    } catch {
      set("open"); // restore: never let a complaint disappear when the save failed
      setPending((p) => ({ ...p, [c.id]: "failed" }));
    }
  }

  const keyOf: Record<GroupBy, (c: Complaint) => string> = {
    category: (c) => CATEGORY_LABEL[c.category],
    street: (c) => name(c.street_id),
    area: (c) => area(c.street_id),
    status: (c) => (c.status === "open" ? "Open" : "Resolved"),
  };
  const visible = data.complaints.filter((c) => (status === "all" || c.status === status || pending[c.id]) && (category === "all" || c.category === category));
  const groups = groupComplaints(visible, keyOf[groupBy]);
  const select = "min-h-10 rounded-xl border bg-card px-2 text-sm";

  return (
    <section className="surface flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-semibold">Complaints <span className="text-muted-foreground">({data.complaints.filter((c) => c.status === "open").length} open)</span></h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Status
            <select className={select} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="open">Open</option><option value="resolved">Resolved (14 days)</option><option value="all">All</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Category
            <select className={select} value={category} onChange={(e) => setCategory(e.target.value as Category | "all")}>
              <option value="all">All</option>
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((k) => <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Group by
            <select className={select} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
              <option value="category">Category</option><option value="street">Street</option><option value="area">Area</option><option value="status">Status</option>
            </select>
          </label>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Stored by street and category only: no names, no house, no free text. New complaints appear here live.</p>

      {groups.length === 0 && <p className="text-sm text-muted-foreground">No complaints match these filters.</p>}
      <div className="flex flex-col gap-2">
        {groups.map((g, i) => (
          <details key={g.key} open={i < 3} className="group rounded-2xl border">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
              <span className="font-medium">{g.key}</span>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {g.open > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">{g.open} open</span>}
                {g.items.length} total
                <span aria-hidden className="transition-transform group-open:rotate-180 motion-reduce:transition-none">▾</span>
              </span>
            </summary>
            <ul className="flex flex-col gap-2 border-t p-2">
              {g.items.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-2">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{CATEGORY_LABEL[c.category]} · {name(c.street_id)}</p>
                    <p className="text-xs text-muted-foreground">{area(c.street_id)} · {now ? ago(c.created_at, now) : ""} · {c.status === "open" ? "open" : "resolved"}</p>
                    {pending[c.id] === "failed" && <p role="alert" className="text-xs text-red-700">Not saved. The complaint is still open.</p>}
                  </div>
                  {c.status === "open" ? (
                    <Button size="sm" variant={pending[c.id] === "failed" ? "default" : "outline"} onClick={() => resolve(c)}>
                      {pending[c.id] === "failed" ? "Retry" : "Resolve"}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{pending[c.id] === "saving" ? "Saving…" : "Resolved ✓"}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
