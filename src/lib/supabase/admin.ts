import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS: use only for AI writes on the server.
// The key must never be exposed to the browser (no NEXT_PUBLIC_ prefix).
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
