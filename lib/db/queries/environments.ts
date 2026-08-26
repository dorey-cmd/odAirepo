import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContractEnvironment, EnvironmentFile } from "@/types/environment";

export async function listEnvironments(supabase: SupabaseClient): Promise<ContractEnvironment[]> {
  const { data, error } = await supabase
    .from("contract_environments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as ContractEnvironment[];
}

export async function getEnvironment(
  supabase: SupabaseClient,
  id: string,
): Promise<ContractEnvironment | null> {
  const { data, error } = await supabase
    .from("contract_environments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ContractEnvironment | null;
}

export async function createEnvironment(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    name: string;
    description?: string;
    createdBy: string;
    storageProvider?: "supabase" | "google_drive";
  },
): Promise<ContractEnvironment> {
  const { data, error } = await supabase
    .from("contract_environments")
    .insert({
      org_id: input.orgId,
      name: input.name,
      description: input.description ?? null,
      created_by: input.createdBy,
      storage_provider: input.storageProvider ?? "supabase",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ContractEnvironment;
}

export async function listEnvironmentFiles(
  supabase: SupabaseClient,
  environmentId: string,
): Promise<EnvironmentFile[]> {
  const { data, error } = await supabase
    .from("environment_files")
    .select("*")
    .eq("environment_id", environmentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as EnvironmentFile[];
}
