"use client";

// /ops Reports: each street's reports of the last 3 h and its status. A report that neighbours
// contradict is flagged for a check, never called false.
import { useState } from "react";
import type { OpsData } from "@/components/ops/data";
import type { StreetStatus, Trust } from "@/components/ops/rules";

const ORDER: Record<Trust, number> = { suspect: 0, unconfirmed: 1, confirmed: 2, none: 3 };
const BADGE: Record<Trust, { label: string; style: string }> = {
  suspect: { label: "Check", style: "bg-amber-100 text-amber-900" },
  unconfirmed: { label: "Unconfirmed", style: "bg-muted text-foreground" },
  confirmed: { label: "Confirmed", style: "bg-emerald-100 text-emerald-900" },
  none: { label: "No reports", style: "bg-muted text-muted-foreground" },
};

function reason(s: StreetStatus): string {
  const what = s.type === "water_on" ? "water" : "no water";
  if (s.status === "confirmed") return `${s.reports} reports agree: ${what}.`;
  if (s.status === "suspect") return `1 report says ${what}, both neighbouring streets say the opposite.`;
  if (s.status === "unconfirmed") return s.reports === 1 ? `1 report says ${what}.` : `${s.reports} reports, mixed. Mostly ${what}.`;
  return "No reports in the last 3 h.";
}

export function Review({ data, name }: { data: OpsData; name: (id: number) => string }) {
  const [all, setAll] = useState(false);
  const rows = [...data.statuses].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const shown = all ? rows : rows.filter((s) => s.status === "suspect" || s.status === "unconfirmed");

  return (
    <section className="flex flex-col gap-3">
      <div role="group" aria-label="Show" className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
        {[false, true].map((v) => (
          <button key={String(v)} type="button" aria-pressed={all === v} onClick={() => setAll(v)} className="min-h-11 rounded-full text-sm font-semibold text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-card">
            {v ? "All streets" : "To check"}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Last 3 hours. Confirmed = 2 or more reports, at least 2 of 3 agree.</p>
      {shown.length === 0 && <p className="surface p-5 text-sm text-muted-foreground">Nothing to check right now.</p>}
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {shown.map((s) => (
          <li key={s.street_id} className={`surface flex flex-col gap-1 p-4 text-sm ${s.status === "suspect" ? "ring-2 ring-amber-300" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{name(s.street_id)}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[s.status].style}`}>{BADGE[s.status].label}</span>
            </div>
            <p className="text-muted-foreground">{reason(s)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
