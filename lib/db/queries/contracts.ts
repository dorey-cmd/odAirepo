import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contract, ContractFile } from "@/types/contract";

export async function listContracts(supabase: SupabaseClient): Promise<(Contract & { contract_environments: { name: string } })[]> {
  const { data, error } = await supabase
    .from("contracts")
    .select("*, contract_environments(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as (Contract & { contract_environments: { name: string } })[];
}

export async function getContract(
  supabase: SupabaseClient,
  id: string,
): Promise<(Contract & { contract_environments: { name: string; id: string } }) | null> {
  const { data, error } = await supabase
    .from("contracts")
    .select("*, contract_environments(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as (Contract & { contract_environments: { name: string; id: string } }) | null;
}

export async function listContractFiles(supabase: SupabaseClient, contractId: string): Promise<ContractFile[]> {
  const { data, error } = await supabase
    .from("contract_files")
    .select("*")
    .eq("contract_id", contractId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return data as ContractFile[];
}
