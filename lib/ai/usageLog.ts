import type { SupabaseClient } from "@supabase/supabase-js";

export async function logAiUsage(
  admin: SupabaseClient,
  entry: {
    orgId: string;
    contractId?: string | null;
    purpose: "field_extraction" | "chat_turn";
    model: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    };
  },
): Promise<void> {
  const { error } = await admin.from("ai_usage_log").insert({
    org_id: entry.orgId,
    contract_id: entry.contractId ?? null,
    purpose: entry.purpose,
    model: entry.model,
    input_tokens: entry.usage.input_tokens,
    output_tokens: entry.usage.output_tokens,
    cache_creation_input_tokens: entry.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: entry.usage.cache_read_input_tokens ?? 0,
  });
  if (error) console.error("logAiUsage failed:", error.message);
}
