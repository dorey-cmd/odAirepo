import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Lightweight polling target for ContractStatusBadge - avoids re-fetching the full contract/chat payload every tick. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: contractId } = await context.params;
  const supabase = await createClient();

  const { data: contract, error } = await supabase
    .from("contracts")
    .select("status, updated_at")
    .eq("id", contractId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(contract);
}
