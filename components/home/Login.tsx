"use client";

// Sign-in: pick who you are. Resident = "Continue as guest" (no name, no account). Driver = tanker + access code.
// CWA staff = access code. Sessions are P3's /api/session. If the server has no sign-in set up yet
// (no service key / v3.sql not run / offline), the demo still opens the screen; a WRONG code never does.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Droplets, KeyRound, LayoutDashboard, LogOut, Mail, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo, SideWaves, saveRole, type Role } from "@/components/ui/brand";
import { LangSwitch } from "@/components/ui/i18n";
import { safeNext, saveGuest, useUser } from "@/components/home/shared";
import { ApiError, MIN_PASSWORD, getTankers, signIn, signOut, signUp, startGuestSession, startStaffSession, type Tanker } from "@/lib/queries";

// Resident accounts (V5): log in, sign up, or stay a guest. Guests report and request; a complaint needs an account.
type Mode = "login" | "signup" | "guest";
const MODES: { id: Mode; label: string }[] = [
  { id: "login", label: "Log in" },
  { id: "signup", label: "Sign up" },
  { id: "guest", label: "Guest" },
];
const AUTH_ERROR: Record<string, string> = {
  invalid_credentials: "Wrong email or password.",
  user_already_exists: "This email already has an account. Log in instead.",
  weak_password: `Use at least ${MIN_PASSWORD} characters.`,
  email_address_invalid: "Check the email address.",
  email_not_confirmed: "Confirm your email first (check your inbox), then log in.",
  over_request_rate_limit: "Too many tries. Wait a minute, then try again.",
  over_email_send_rate_limit: "Too many tries. Wait a minute, then try again.",
};

const ROLES: { id: Role; label: string; Icon: typeof Truck }[] = [
  { id: "resident", label: "Resident", Icon: Droplets },
  { id: "driver", label: "Tanker driver", Icon: Truck },
  { id: "ops", label: "CWA staff", Icon: LayoutDashboard },
];
const DEST: Record<Role, string> = { resident: "/resident", driver: "/driver", ops: "/ops" };
const DEMO_TANKERS: Tanker[] = [
  { id: 1, name: "Demo tanker 1", capacity_litres: 1000, active: true },
  { id: 2, name: "Demo tanker 2", capacity_litres: 1000, active: true },
];
// Codes that mean "you typed something wrong": show it and stay. Anything else = sign-in not available here.
const WRONG: Record<string, string> = {
  bad_access_code: "That access code is not right. Check it and try again.",
  unknown_tanker: "That tanker is not in service. Choose another one.",
  invalid_tanker_id: "Choose your tanker first.",
};
const input = "h-12 w-full rounded-full bg-muted px-4 text-base text-foreground placeholder:text-muted-foreground";

export function Login({ asked, next, mode: askedMode }: { asked: Role; next?: string; mode?: "login" | "signup" }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(asked);
  const [mode, setMode] = useState<Mode>(askedMode ?? (next ? "login" : "guest"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const user = useUser();
  const back = safeNext(next) ?? "/resident";
  const [code, setCode] = useState("");
  const [tankers, setTankers] = useState<Tanker[] | null>(null);
  const [tanker, setTanker] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role !== "driver" || tankers) return;
    getTankers()
      .then((t) => (t.some((x) => x.active) ? t.filter((x) => x.active) : DEMO_TANKERS))
      .catch(() => DEMO_TANKERS)
      .then((t) => {
        setTankers(t);
        setTanker((cur) => cur ?? t[0].id);
      });
  }, [role, tankers]);

  const pick = (r: Role) => {
    setRole(r);
    setCode("");
    setError(null);
  };

  // Email + password (Supabase Auth). The email is only ever shown to its owner.
  const account = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const u = mode === "signup" ? await signUp(email, password) : await signIn(email, password);
      if (!u) {
        setBusy(false);
        setMode("login");
        return setNote("Account created. Confirm your email from your inbox, then log in.");
      }
      saveRole("resident");
      saveGuest();
      startGuestSession().catch(() => {}); // reports and requests still use the guest session
      router.push(back);
    } catch (err) {
      setBusy(false);
      const c = err instanceof ApiError ? err.code : "";
      setError(AUTH_ERROR[c] ?? "Could not reach the sign-in service. Try again, or continue as guest.");
    }
  };

  const enter = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (role === "driver" && !tanker) return setError(WRONG.invalid_tanker_id);
    if (role !== "resident" && !code.trim()) return setError("Enter your access code.");
    setBusy(true);
    try {
      if (role === "resident") await startGuestSession();
      else await startStaffSession(role, code.trim(), role === "driver" ? (tanker ?? undefined) : undefined);
    } catch (err) {
      if (err instanceof ApiError && WRONG[err.code]) {
        setBusy(false);
        return setError(WRONG[err.code]);
      }
      console.warn("sign-in not available here, opening the demo:", err); // ponytail: demo opens the screen; P3's API still guards every write
    }
    saveRole(role);
    if (role === "resident") saveGuest();
    router.push(role === "resident" ? back : DEST[role]);
  };

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.15fr]">
      {/* Brand panel, from 1024px */}
      <section className="wave-panel relative hidden flex-col overflow-hidden p-10 lg:flex xl:p-14">
        <SideWaves />
        <Link href="/" className="relative self-start"><Logo /></Link>
        <div className="relative mt-auto mb-auto max-w-md">
          <h2 className="text-5xl leading-[1.02] font-bold tracking-[-0.04em]">Water, when it really comes.</h2>
          <ul className="mt-8 flex flex-col gap-3 text-lg text-white/90">
            {["Official CWA timetable for your locality", "Neighbours' reports, confirmed when they agree", "The tanker truck live on the map"].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/20"><Check aria-hidden className="size-4" /></span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/75">Stored by street, never by house or person.</p>
      </section>

      <section className="flex flex-col px-4 pt-4 pb-8 sm:px-8 lg:justify-center lg:px-14">
        <div className="flex items-center justify-between lg:justify-end">
          <Link href="/" aria-label="Kot Delo? home" className="lg:hidden"><Logo /></Link>
          <LangSwitch />
        </div>
        <div className="mx-auto mt-8 w-full max-w-md lg:mt-0">
          <Link href="/" className="hidden min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground lg:inline-flex">
            <ArrowLeft aria-hidden className="size-4" /> Back to home
          </Link>
          <h1 className="mt-2 text-3xl leading-tight font-bold tracking-[-0.03em] sm:text-4xl">Welcome to Kot Delo?</h1>
          <p className="mt-2 text-muted-foreground">Who is using the app today?</p>

          <div role="group" aria-label="Choose your role" className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            {ROLES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={role === id}
                onClick={() => pick(id)}
                className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-card px-2 py-3 text-center text-sm font-semibold shadow-card transition-[scale,background-color,color] duration-150 ease-snap active:scale-[0.97] aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary group-aria-pressed:bg-white/20 group-aria-pressed:text-white">
                  <Icon aria-hidden className="size-5" />
                </span>
                {label}
              </button>
            ))}
          </div>

          {role === "resident" && user && (
            <section className="surface mt-5 flex flex-col gap-3 p-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><Check aria-hidden className="size-4" /> Signed in</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <Button size="tap" onClick={() => router.push(back)}>Open my water <ArrowRight aria-hidden /></Button>
              <Button size="tap" variant="secondary" onClick={() => signOut().catch(() => {})}><LogOut aria-hidden /> Log out</Button>
            </section>
          )}
          {role === "resident" && !user && (
            <div role="group" aria-label="How do you want to continue?" className="mt-5 grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={mode === m.id}
                  onClick={() => { setMode(m.id); setError(null); setNote(null); }}
                  className="min-h-11 rounded-full text-sm font-semibold text-muted-foreground transition-[background-color,color] duration-150 ease-snap aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-card"
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          {!(role === "resident" && user) && (
          <form key={`${role}-${mode}`} onSubmit={role === "resident" && mode !== "guest" ? account : enter} className="surface mt-5 flex flex-col gap-4 p-6 transition-[opacity,translate] duration-200 ease-snap starting:translate-y-1 starting:opacity-0">
            {role === "resident" && mode !== "guest" ? (
              <>
                <div>
                  <h2 className="text-lg font-bold tracking-[-0.01em]">{mode === "signup" ? "Create an account" : "Log in"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Needed only for complaints. No name asked.</p>
                </div>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Email
                  <span className="relative">
                    <Mail aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
                    <input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={`${input} pl-11`} />
                  </span>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Password
                  <span className="relative">
                    <KeyRound aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
                    <input type="password" required minLength={mode === "signup" ? MIN_PASSWORD : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? `At least ${MIN_PASSWORD} characters` : "Password"} className={`${input} pl-11`} />
                  </span>
                </label>
                {note && <p role="status" className="text-sm text-emerald-800">{note}</p>}
                {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
                <Button type="submit" size="tap" disabled={busy}>
                  {busy ? "One moment…" : mode === "signup" ? "Create account" : "Log in"} <ArrowRight aria-hidden />
                </Button>
                <button type="button" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(null); }} className="min-h-11 text-sm font-medium text-primary underline underline-offset-2">
                  {mode === "signup" ? "Have an account? Log in" : "New here? Create an account"}
                </button>
              </>
            ) : role === "resident" ? (
              <>
                <div>
                  <h2 className="text-lg font-bold tracking-[-0.01em]">Continue as a guest</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Report water and request a tanker. No account, no name.
                  </p>
                </div>
                <Button type="submit" size="tap" disabled={busy}>
                  {busy ? "Opening…" : "Continue as guest"} <ArrowRight aria-hidden />
                </Button>
              </>
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-bold tracking-[-0.01em]">{role === "driver" ? "Driver sign-in" : "CWA staff sign-in"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {role === "driver" ? "Choose the tanker you drive today and enter the access code from your supervisor." : "Enter the operations access code to see priorities, dispatch and complaints."}
                  </p>
                </div>
                {role === "driver" && (
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    Your tanker
                    <select className={`${input} appearance-none`} value={tanker ?? ""} disabled={!tankers} onChange={(e) => setTanker(Number(e.target.value) || null)}>
                      {!tankers && <option value="">Loading tankers…</option>}
                      {tankers?.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} · {t.capacity_litres.toLocaleString("en-GB")} L</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Access code
                  <span className="relative">
                    <KeyRound aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
                    <input type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Access code" className={`${input} pl-11`} />
                  </span>
                </label>
                {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
                <Button type="submit" size="tap" disabled={busy}>
                  {busy ? "Signing in…" : "Sign in"} <ArrowRight aria-hidden />
                </Button>
              </>
            )}
          </form>
          )}
          <p className="mt-5 text-center text-xs text-muted-foreground">Stored by street, never by house or person.</p>
        </div>
      </section>
    </main>
  );
}
