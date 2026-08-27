import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client - bypasses RLS entirely. Only for server-side code paths
 * that run without a logged-in lawyer session (webhook ingestion, background
 * intake processing). Callers MUST set org_id/environment_id correctly
 * themselves; RLS provides no protection here.
 *
 * Never import this from client components or expose SUPABASE_SERVICE_ROLE_KEY
 * to the browser.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
