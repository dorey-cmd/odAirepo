import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runChatTurn } from "@/lib/ai/chatEngine";
import { translateAiError } from "@/lib/ai/errorMessages";
import { VIEW_AS_STASH_COOKIE, type ViewAsStash } from "@/lib/admin/viewAs";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: contractId } = await context.params;
  const supabase = await createClient();

  const { data: chat, error: chatError } = await supabase
    .from("contract_chats")
    .select("id")
    .eq("contract_id", contractId)
    .maybeSingle();
  if (chatError) return NextResponse.json({ error: chatError.message }, { status: 500 });
  if (!chat) return NextResponse.json({ messages: [] });

  const { data: messages, error } = await supabase
    .from("contract_chat_messages")
    .select("*")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: contractId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.message || typeof body.message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const attachmentFileIds: string[] = Array.isArray(body.attachment_file_ids) ? body.attachment_file_ids : [];

  // RLS-scoped read - throws no rows if this contract isn't in the caller's org.
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, org_id")
    .eq("id", contractId)
    .single();
  if (contractError || !contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const { data: chat, error: chatError } = await supabase
    .from("contract_chats")
    .select("id")
    .eq("contract_id", contractId)
    .single();
  if (chatError || !chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  // If a platform admin is currently viewing-as this user (see
  // /admin/view-as), the DB session genuinely is this user - RLS and every
  // other feature just work - but the audit trail should still show who was
  // really behind the wheel, not just "the lawyer sent this."
  const stashRaw = (await cookies()).get(VIEW_AS_STASH_COOKIE)?.value;
  let impersonatedBy: string | null = null;
  if (stashRaw) {
    try {
      impersonatedBy = (JSON.parse(stashRaw) as ViewAsStash).adminUserId;
    } catch {
      // malformed stash - treat as not impersonating
    }
  }

  const { error: insertError } = await supabase.from("contract_chat_messages").insert({
    chat_id: chat.id,
    org_id: contract.org_id,
    role: "lawyer",
    content: body.message,
    attachment_file_ids: attachmentFileIds,
    impersonated_by: impersonatedBy,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const admin = createAdminClient();
    const newMessages = await runChatTurn(admin, contractId, req.signal);
    return NextResponse.json({ messages: newMessages });
  } catch (err) {
    // The lawyer cancelled (see ContractChat.tsx). With `supportsCancellation`
    // enabled for this route in vercel.json, Vercel aborts req.signal and can
    // terminate the function outright on client disconnect, so this response
    // is a best-effort fallback for the case where the abort races a normal
    // completion rather than the only place cancellation is handled.
    if (req.signal.aborted) return NextResponse.json({ error: "aborted" }, { status: 499 });
    console.error(`chat turn failed for contract ${contractId}:`, err);
    return NextResponse.json({ error: translateAiError((err as Error).message) }, { status: 500 });
  }
}
