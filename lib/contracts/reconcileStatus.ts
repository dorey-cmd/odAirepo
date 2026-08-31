import type { SupabaseClient } from "@supabase/supabase-js";

const STALE_AFTER_MS = 15 * 60 * 1000; // matches chatEngine.ts's own turn-lock staleness window

/**
 * A contract can only truthfully show "AI is working" (drafting/revising)
 * while a turn genuinely holds the lock in chatEngine.ts. If a turn crashed
 * hard enough to skip its own cleanup - a killed process, not a catchable
 * exception - the badge could otherwise show "AI is working" forever with
 * nothing actually happening. Call this wherever a contract's live status is
 * read (the polling endpoint, list pages) so the truth self-heals within
 * moments instead of staying wrong indefinitely.
 */
export async function reconcileStaleStatus(
  admin: SupabaseClient,
  contract: { id: string; org_id: string; status: string; active_turn_started_at: string | null },
): Promise<string> {
  if (contract.status !== "drafting" && contract.status !== "revising") return contract.status;

  const staleCutoff = Date.now() - STALE_AFTER_MS;
  const isStale = !contract.active_turn_started_at || new Date(contract.active_turn_started_at).getTime() < staleCutoff;
  if (!isStale) return contract.status;

  const { data: updated } = await admin
    .from("contracts")
    .update({ status: "error", active_turn_started_at: null, updated_at: new Date().toISOString() })
    .eq("id", contract.id)
    .eq("status", contract.status) // no-op if it changed since we read it (a real turn just finished)
    .select("id")
    .maybeSingle();
  if (!updated) return contract.status;

  const { data: chat } = await admin.from("contract_chats").select("id").eq("contract_id", contract.id).maybeSingle();
  if (chat) {
    await admin.from("contract_chat_messages").insert({
      chat_id: chat.id,
      org_id: contract.org_id,
      role: "assistant",
      content:
        "התהליך נעצר באופן בלתי צפוי (כנראה עקב תקלת שרת) ולא הושלם. שום דבר שכבר הוכן לא הלך לאיבוד - אפשר לנסות שוב על ידי שליחת הודעה.",
    });
  }

  return "error";
}
