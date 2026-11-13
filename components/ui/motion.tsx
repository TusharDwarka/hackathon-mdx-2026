"use client";

// Small motion helpers (CSS lives in app/globals.css: tilt, reveal, scroll-progress, bar-on-scroll).
// Both do nothing with reduced motion; tilt only reacts to a mouse, never to touch.
import { useEffect, useRef } from "react";

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Spread on an element with the `tilt` class: <div className="tilt surface" {...tilt}>. */
export const tilt = {
  onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse" || calm()) return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const k = Math.min(6, 1800 / r.width); // wide panels tilt less
    el.dataset.tilting = "";
    el.style.setProperty("--ry", `${(x - 0.5) * k}deg`);
    el.style.setProperty("--rx", `${(0.5 - y) * k}deg`);
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  },
  onPointerLeave(e: React.PointerEvent<HTMLElement>) {
    const el = e.currentTarget;
    delete el.dataset.tilting;
    for (const p of ["--rx", "--ry", "--mx", "--my"]) el.style.removeProperty(p);
  },
};

/** A number that counts up when it scrolls into view. The final value is in the HTML from the start. */
export function CountUp({ to, decimals = 0, suffix = "" }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const text = (v: number) => `${v.toFixed(decimals)}${suffix}`;
  useEffect(() => {
    const el = ref.current;
    if (!el || calm() || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / 1400);
        el.textContent = `${(to * (1 - (1 - p) ** 3)).toFixed(decimals)}${suffix}`;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, decimals, suffix]);
  return <span ref={ref} className="tabular-nums">{text(to)}</span>;
}
