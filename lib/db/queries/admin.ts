import type { SupabaseClient } from "@supabase/supabase-js";

export async function isPlatformAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) {
    console.error("is_platform_admin check failed:", error.message);
    return false;
  }
  return Boolean(data);
}
