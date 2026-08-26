import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runChatTurn } from "@/lib/ai/chatEngine";

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

  // RLS-scoped read — throws no rows if this contract isn't in the caller's org.
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

  const { error: insertError } = await supabase.from("contract_chat_messages").insert({
    chat_id: chat.id,
    org_id: contract.org_id,
    role: "lawyer",
    content: body.message,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const admin = createAdminClient();
    const newMessages = await runChatTurn(admin, contractId);
    return NextResponse.json({ messages: newMessages });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
