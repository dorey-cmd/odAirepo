import type { SupabaseClient } from "@supabase/supabase-js";

export async function logAiUsage(
  admin: SupabaseClient,
  entry: {
    orgId: string;
    contractId?: string | null;
    purpose: "field_extraction" | "chat_turn";
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  },
): Promise<void> {
  const { error } = await admin.from("ai_usage_log").insert({
    org_id: entry.orgId,
    contract_id: entry.contractId ?? null,
    purpose: entry.purpose,
    model: entry.model,
    input_tokens: entry.usage.input_tokens,
    output_tokens: entry.usage.output_tokens,
  });
  if (error) console.error("logAiUsage failed:", error.message);
}
