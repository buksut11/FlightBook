import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. SERVER ACTIONS GUARDED BY requireAdmin() ONLY.
 * Never import this into a client component.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
