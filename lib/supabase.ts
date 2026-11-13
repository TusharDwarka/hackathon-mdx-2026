import { createClient } from "@supabase/supabase-js";

// Browser/anon client: safe to use in components. Writes are limited by RLS (sql/schema.sql).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "missing-anon-key"
);
