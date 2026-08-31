import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileStaleStatus } from "@/lib/contracts/reconcileStatus";

/** Lightweight polling target for ContractStatusBadge - avoids re-fetching the full contract/chat payload every tick. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: contractId } = await context.params;
  const supabase = await createClient();

  const { data: contract, error } = await supabase
    .from("contracts")
    .select("org_id, status, updated_at, active_turn_started_at")
    .eq("id", contractId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const status = await reconcileStaleStatus(createAdminClient(), { id: contractId, ...contract });
  return NextResponse.json({ status, updated_at: status === contract.status ? contract.updated_at : new Date().toISOString() });
}
