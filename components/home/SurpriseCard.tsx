// Surprise-card constraint (docs/WATER-DAY-SPLIT.md). The text comes from P1 (DECISIONS #9) once revealed.
// Pass it here: title names the constraint, body says how the app meets it, href opens the feature that meets it.
// Nothing to show yet = renders nothing.
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export function SurpriseCard({ title, body, href, cta = "See it in the app" }: { title?: string; body?: string; href?: string; cta?: string }) {
  if (!title || !body || !href) return null;
  return (
    <section aria-labelledby="surprise-title" className="surface flex flex-col gap-2 p-5 ring-2 ring-primary/30 md:col-span-2 xl:col-span-3">
      <p className="chip min-h-6 self-start bg-primary/10 px-2 text-xs text-primary">
        <Sparkles aria-hidden className="size-3.5" /> Challenge
      </p>
      <h2 id="surprise-title" className="text-lg leading-snug font-bold tracking-[-0.01em]">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-primary">
        {cta} <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
