import type { SupabaseClient } from "@supabase/supabase-js";

/** The org the current lawyer's actions apply to. MVP = one org per lawyer. */
export async function getCurrentOrgId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("profiles")
    .select("default_org_id")
    .eq("user_id", user.id)
    .single();

  if (error) throw new Error(`Could not resolve org for user: ${error.message}`);
  if (!data?.default_org_id) throw new Error("User has no default_org_id — signup trigger may not have run");
  return data.default_org_id as string;
}
