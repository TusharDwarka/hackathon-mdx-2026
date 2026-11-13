import { createClient } from "@supabase/supabase-js";

// Service-role client: SERVER ONLY (route handlers, scripts). Never import in a client component.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
