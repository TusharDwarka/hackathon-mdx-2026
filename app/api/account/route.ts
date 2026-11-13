// POST /api/account {email, password}: creates a resident account, already confirmed.
// Why server-side: Supabase "Confirm email" is on and its built-in mailer allows only a few emails an hour
// (over_email_send_rate_limit), so browser sign-ups failed and nobody could log in. No email is sent;
// the browser then signs in with signInWithPassword. No name, no profile (V5 accounts).
import { validateCredentials } from "@/lib/queries";
import { db, handle, HttpError, readJson, valid } from "../_lib/server";

const NEW_ACCOUNTS_PER_MINUTE = 20; // ponytail: whole-site cap in memory per server instance, a table if abused
let window = { at: 0, n: 0 };

export const POST = handle(async (req) => {
  const b = (await readJson(req)) as { email?: unknown; password?: unknown } | null;
  const { email, password } = valid(validateCredentials(String(b?.email ?? ""), String(b?.password ?? "")));
  const now = Date.now();
  if (now - window.at > 60_000) window = { at: now, n: 0 };
  if (++window.n > NEW_ACCOUNTS_PER_MINUTE) throw new HttpError(429, "over_request_rate_limit", { retry_after_s: 60 });

  const { error } = await db().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    if (error.code === "email_exists" || /already/i.test(error.message)) throw new HttpError(400, "user_already_exists");
    if (error.code === "weak_password") throw new HttpError(400, "weak_password");
    console.error("account: create failed:", error.code, error.message);
    throw new HttpError(502, "auth_error");
  }
  return Response.json({ ok: true }, { status: 201 });
});
