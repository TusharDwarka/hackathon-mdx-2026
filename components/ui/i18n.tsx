"use client";

// English / Français / Kreol for every screen without touching each component: after React renders
// (in English), this swaps every text node and the placeholder / aria-label / title attributes for
// the chosen language, and keeps doing it as the page changes (MutationObserver). The English
// original is remembered per node, so switching back restores it exactly.
// Keys are the English strings as written in the code; "{0}" marks a value filled in at runtime.
// Not in the dictionary (street names, notice titles from CWA) = stays as it is.
import { useEffect, useSyncExternalStore } from "react";
import { DICT_1 } from "@/components/ui/i18n-dict-1";
import { DICT_2 } from "@/components/ui/i18n-dict-2";
import { DICT_3 } from "@/components/ui/i18n-dict-3";

export type Lang = "en" | "fr" | "mfe";
const KEY = "kotdelo.lang";
const EVENT = "kotdelo:lang";
const ATTRS = ["placeholder", "aria-label", "title", "alt"];

export const readLang = (): Lang => {
  try { const v = localStorage.getItem(KEY); return v === "fr" || v === "mfe" ? v : "en"; } catch { return "en"; }
};
export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* private mode: this page only */ }
  window.dispatchEvent(new Event(EVENT));
}
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};
export const useLang = () => useSyncExternalStore(subscribe, readLang, () => "en" as Lang);

// ---------- dictionary ----------
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const EXACT = new Map<string, [string, string]>();
const TEMPLATES: { re: RegExp; out: [string, string] }[] = [];
for (const [en, out] of Object.entries({ ...DICT_1, ...DICT_2, ...DICT_3 })) {
  const k = norm(en);
  if (!/\{\d\}/.test(k)) { EXACT.set(k, out); continue; }
  const src = k.split(/(\{\d\})/).map((p) => (/^\{\d\}$/.test(p) ? "(.*?)" : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
  TEMPLATES.push({ re: new RegExp(`^${src}$`), out });
}
TEMPLATES.sort((a, b) => b.re.source.length - a.re.source.length); // most specific first

// Dates like "Sat 14 Nov" or "14 November 2026" (toLocaleDateString en-GB): word by word.
const DATE_WORDS: Record<string, [string, string]> = {
  Mon: ["lun.", "Lin"], Tue: ["mar.", "Mar"], Wed: ["mer.", "Mer"], Thu: ["jeu.", "Ze"], Fri: ["ven.", "Van"], Sat: ["sam.", "Sam"], Sun: ["dim.", "Dim"],
  Monday: ["lundi", "Lindi"], Tuesday: ["mardi", "Mardi"], Wednesday: ["mercredi", "Merkredi"], Thursday: ["jeudi", "Zedi"], Friday: ["vendredi", "Vandredi"], Saturday: ["samedi", "Samdi"], Sunday: ["dimanche", "Dimans"],
  Jan: ["janv.", "Zan"], Feb: ["févr.", "Fev"], Mar: ["mars", "Mar"], Apr: ["avr.", "Avr"], May: ["mai", "Me"], Jun: ["juin", "Zin"], Jul: ["juil.", "Zil"], Aug: ["août", "Out"], Sep: ["sept.", "Sep"], Sept: ["sept.", "Sep"], Oct: ["oct.", "Okt"], Nov: ["nov.", "Nov"], Dec: ["déc.", "Des"],
  January: ["janvier", "Zanvie"], February: ["février", "Fevrie"], March: ["mars", "Mars"], April: ["avril", "Avril"], June: ["juin", "Zin"], July: ["juillet", "Zilie"], August: ["août", "Out"], September: ["septembre", "Septam"], October: ["octobre", "Oktob"], November: ["novembre", "Novam"], December: ["décembre", "Desam"],
};

const cache = { fr: new Map<string, string | null>(), mfe: new Map<string, string | null>() };
export function translate(text: string, lang: "fr" | "mfe", depth = 0): string | null {
  const c = cache[lang];
  if (c.has(text)) return c.get(text)!;
  const i = lang === "fr" ? 0 : 1;
  const k = norm(text);
  let res: string | null = EXACT.get(k)?.[i] ?? null;
  if (res === null && depth < 2) {
    for (const t of TEMPLATES) {
      const m = t.re.exec(k);
      if (!m) continue;
      res = t.out[i].replace(/\{(\d)\}/g, (_, n) => { const v = m[Number(n) + 1] ?? ""; return translate(v, lang, depth + 1) ?? v; });
      break;
    }
  }
  if (res === null) {
    const words = k.split(/([\s,·–-]+)/);
    if (words.some((w) => DATE_WORDS[w]) && words.every((w) => !/[A-Za-z]/.test(w) || DATE_WORDS[w])) res = words.map((w) => DATE_WORDS[w]?.[i] ?? w).join("");
  }
  c.set(text, res);
  return res;
}

// ---------- DOM ----------
type Rec = { en: string; out: string };
const TEXT = new WeakMap<Text, Rec>();
const ATTR = new WeakMap<Element, Record<string, Rec>>();
const skip = (el: Element | null) => !!el?.closest("script,style,textarea,code,[data-no-translate],.leaflet-tile-pane");

function swap(rec: Rec | undefined, current: string, lang: Lang): Rec {
  const r = !rec || current !== rec.out ? { en: current, out: current } : rec; // changed by React = new English
  if (lang === "en") return { en: r.en, out: r.en };
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.en)!;
  const t = m[2] ? translate(m[2], lang) : null;
  return { en: r.en, out: t == null ? r.en : m[1] + t + m[3] };
}
function doText(n: Text, lang: Lang) {
  if (skip(n.parentElement)) return;
  const r = swap(TEXT.get(n), n.nodeValue ?? "", lang);
  TEXT.set(n, r);
  if (n.nodeValue !== r.out) n.nodeValue = r.out;
}
function doAttrs(el: Element, lang: Lang) {
  if (skip(el)) return;
  const recs = ATTR.get(el) ?? {};
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v == null) continue;
    const r = swap(recs[a], v, lang);
    recs[a] = r;
    if (v !== r.out) el.setAttribute(a, r.out);
  }
  ATTR.set(el, recs);
}
function walk(root: Node, lang: Lang) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text, lang);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  doAttrs(root as Element, lang);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text, lang);
    else doAttrs(n as Element, lang);
  }
}

let titleEn = "";
/** Mounted once in app/layout.tsx. */
export function Translator() {
  const lang = useLang();
  useEffect(() => {
    document.documentElement.lang = lang === "mfe" ? "mfe" : lang;
    const run = () => {
      // The page title is English unless we set it: remember the English one before translating.
      if (!titleEn || (translate(titleEn, "fr") !== document.title && translate(titleEn, "mfe") !== document.title)) titleEn = document.title;
      walk(document.body, lang);
      document.title = (lang === "en" ? null : translate(titleEn, lang)) ?? titleEn;
    };
    const first = setTimeout(run, 0); // after hydration
    const obs = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "characterData") doText(m.target as Text, lang);
        else if (m.type === "attributes") doAttrs(m.target as Element, lang);
        else m.addedNodes.forEach((n) => walk(n, lang));
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => { clearTimeout(first); obs.disconnect(); };
  }, [lang]);
  return null;
}

const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: "en", label: "EN", name: "English" },
  { id: "fr", label: "FR", name: "Français" },
  { id: "mfe", label: "KR", name: "Kreol" },
];
/** EN · FR · KR switch. Never translated itself. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <div data-no-translate role="group" aria-label="Language / Langue / Lang" className={`inline-flex shrink-0 gap-0.5 rounded-full bg-card p-1 shadow-card ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          lang={l.id}
          title={l.name}
          aria-pressed={lang === l.id}
          onClick={() => setLang(l.id)}
          className="min-h-9 min-w-10 rounded-full px-2 text-xs font-bold text-muted-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
