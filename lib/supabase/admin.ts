import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/supabase/env";

/**
 * Service-role client. SERVER ACTIONS GUARDED BY requireAdmin() ONLY.
 * Never import this into a client component.
 */
export function createAdminClient() {
  return createClient(
    requireEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY"
    ),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
