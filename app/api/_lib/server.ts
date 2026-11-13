// Shared server code for /api/* route handlers (P3). `_lib` is a private folder: not a route.
// Sessions: an opaque random token in an httpOnly cookie; only its SHA-256 is stored (sql/v3.sql).
// Every write checks the session role here AND calls a sql/v3.sql function that re-checks
// ownership and limits inside one transaction.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-server";
import type { Role, SessionInfo } from "@/lib/queries";

export const COOKIE = "kd_session";
const TTL_HOURS: Record<Role, number> = { guest: 24, driver: 12, ops: 12 };
const NEW_GUESTS_PER_MINUTE = 60; // whole-site cap on new guest sessions (scripted flooding)

export type Session = { id: string; role: Role; tanker_id: number | null; expires_at: string };

export class HttpError extends Error {
  constructor(public status: number, public code: string, public extra: Record<string, unknown> = {}) {
    super(code);
  }
}

// Refusal codes returned by the sql/v3.sql functions -> HTTP status.
const STATUS: Record<string, number> = {
  throttled: 429, too_many_open_requests: 429,
  unknown_street: 400, invalid_type: 400, invalid_litres: 400, invalid_category: 400, unknown_tanker: 400,
  not_your_round: 403,
  unknown_stop: 404, unknown_round: 404,
  tanker_busy: 409, no_outstanding_demand: 409, round_not_active: 409,
};

/** Service-role client. 503 when the key is not set here (clients then use demo / legacy paths). */
export function db(): SupabaseClient {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, "backend_not_configured");
  }
  return supabaseAdmin();
}

/** Throws a Supabase/PostgREST error as HttpError; a missing v3 table/function becomes 503. */
export function dbError(e: { code?: string; message?: string } | null): void {
  if (!e) return;
  if (e.code === "42P01" || e.code === "42703" || e.code === "PGRST202" || e.code === "PGRST204" || e.code === "PGRST205") {
    throw new HttpError(503, "migration_missing", { hint: "run sql/v3.sql in Supabase" });
  }
  throw e;
}

/** Calls a kd_* function; {ok:false, error} becomes the matching HTTP error. */
export async function rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await db().rpc(name, args);
  dbError(error);
  const out = data as { ok: boolean; error?: string } & Record<string, unknown>;
  if (!out.ok) {
    const code = out.error ?? "refused";
    const rest = Object.fromEntries(Object.entries(out).filter(([k]) => k !== "ok" && k !== "error"));
    throw new HttpError(STATUS[code] ?? 400, code, rest);
  }
  return out;
}

/**
 * Wraps a handler: HttpError -> JSON {error}, anything else -> 500 without internals.
 * connection() first: always run at request time (cacheComponents would otherwise try to prerender
 * a GET at build time, and a build without keys would freeze a 503 into a static response).
 */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    await connection();
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) {
        const headers: Record<string, string> = {};
        if (e.status === 429 && typeof e.extra.retry_after_s === "number") headers["retry-after"] = String(e.extra.retry_after_s);
        return Response.json({ error: e.code, ...e.extra }, { status: e.status, headers });
      }
      console.error("api error:", e);
      return Response.json({ error: "server_error" }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

/** Unwraps a lib/queries.ts validator result or throws 400. */
export function valid<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new HttpError(400, r.error);
  return r.value;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function currentSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const { data, error } = await db()
    .from("sessions")
    .select("id,role,tanker_id,expires_at")
    .eq("token_hash", sha256(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  dbError(error);
  return (data as Session | null) ?? null;
}

/** 401 without a session; 403 when the role is not one of `roles` (empty = any role). */
export async function requireSession(...roles: Role[]): Promise<Session> {
  const s = await currentSession();
  if (!s) throw new HttpError(401, "session_required");
  if (roles.length && !roles.includes(s.role)) throw new HttpError(403, "forbidden", { need: roles });
  return s;
}

export async function createSession(role: Role, tankerId: number | null): Promise<Session> {
  const client = db();
  if (role === "guest") {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count, error } = await client.from("sessions").select("id", { count: "exact", head: true }).eq("role", "guest").gte("created_at", since);
    dbError(error);
    if ((count ?? 0) >= NEW_GUESTS_PER_MINUTE) throw new HttpError(429, "throttled", { retry_after_s: 60 });
  }
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + TTL_HOURS[role] * 3_600_000);
  const { data, error } = await client
    .from("sessions")
    .insert({ token_hash: sha256(token), role, tanker_id: tankerId, expires_at: expires.toISOString() })
    .select("id,role,tanker_id,expires_at")
    .single();
  dbError(error);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires,
  });
  // Housekeeping: sessions expired for over a day are deleted (their session_actions go with them).
  await client.from("sessions").delete().lt("expires_at", new Date(Date.now() - 86_400_000).toISOString());
  return data as Session;
}

export async function deleteSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db().from("sessions").delete().eq("token_hash", sha256(token));
  store.delete(COOKIE);
}

/**
 * Staff access codes come from the server env (DRIVER_ACCESS_CODE / OPS_ACCESS_CODE, set by P1).
 * Without them, the DEMO codes "demo-driver" / "demo-ops" work only outside production, or when
 * KD_DEMO_ACCESS=1 is set on purpose; the session then says demo_access: true.
 */
export function checkAccessCode(role: "driver" | "ops", code: unknown): { demo: boolean } {
  const configured = role === "driver" ? process.env.DRIVER_ACCESS_CODE : process.env.OPS_ACCESS_CODE;
  const demoAllowed = process.env.NODE_ENV !== "production" || process.env.KD_DEMO_ACCESS === "1";
  const expected = configured || (demoAllowed ? `demo-${role}` : null);
  if (!expected) throw new HttpError(503, "staff_access_not_configured");
  const a = Buffer.from(typeof code === "string" ? code : "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(403, "bad_access_code");
  return { demo: !configured };
}

export function sessionInfo(s: Session | null, demo?: boolean): SessionInfo {
  return s
    ? { role: s.role, tanker_id: s.tanker_id, expires_at: s.expires_at, ...(demo !== undefined ? { demo_access: demo } : {}) }
    : { role: null, tanker_id: null, expires_at: null };
}
