import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runChatTurn } from "@/lib/ai/chatEngine";
import { translateAiError } from "@/lib/ai/errorMessages";

/**
 * Continues a multi-section draft with no new lawyer message - see
 * lib/ai/chatEngine.ts. The chat route's client keeps calling this in a loop
 * while the last message is a non-final submit_draft_section, so a large
 * contract can take as many short turns as it needs without any single
 * request risking a timeout.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: contractId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // RLS-scoped read - throws no rows if this contract isn't in the caller's org.
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id")
    .eq("id", contractId)
    .single();
  if (contractError || !contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  try {
    const admin = createAdminClient();
    const newMessages = await runChatTurn(admin, contractId, req.signal);
    return NextResponse.json({ messages: newMessages });
  } catch (err) {
    if (req.signal.aborted) return NextResponse.json({ error: "aborted" }, { status: 499 });
    console.error(`continue-draft failed for contract ${contractId}:`, err);
    return NextResponse.json({ error: translateAiError((err as Error).message) }, { status: 500 });
  }
}
