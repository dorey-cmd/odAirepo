import type { SupabaseClient } from "@supabase/supabase-js";
import { createClaudeClient, DRAFTING_MODEL } from "@/lib/ai/claudeClient";
import { buildDraftingSystemPrompt } from "@/lib/ai/prompts/draftingSystemPrompt";
import { CHAT_TOOLS } from "@/lib/ai/tools";
import { logAiUsage } from "@/lib/ai/usageLog";
import { getContractStorageProvider, getEnvironmentStorageProvider } from "@/lib/storage/factory";
import { renderDocument } from "@/lib/rendering/documentRenderClient";

interface ChatMessageRow {
  id: string;
  role: "lawyer" | "assistant" | "system";
  content: string | null;
  tool_call: unknown;
  created_at: string;
}

/**
 * Runs one AI turn for a contract's chat: builds context from the environment's
 * template/guidelines/learned rules + full chat history, calls Claude, and
 * persists whatever it produces (a clarifying question, a rendered draft, or a
 * proposed guideline update). See plan §"AI Drafting, Chat & Learning Loop".
 *
 * Simplification vs. the plan: tool calls are summarized into plain assistant
 * text for history replay rather than replayed as literal tool_use/tool_result
 * blocks - each turn is a fresh decision informed by the full text history and
 * current contract state, not a strict multi-turn tool-use conversation.
 */
export async function runChatTurn(
  admin: SupabaseClient,
  contractId: string,
  signal?: AbortSignal,
): Promise<ChatMessageRow[]> {
  const { data: contract, error: contractError } = await admin
    .from("contracts")
    .select("*, contract_environments(*)")
    .eq("id", contractId)
    .single();
  if (contractError || !contract) throw new Error(`Contract not found: ${contractError?.message}`);

  const environment = contract.contract_environments as Record<string, unknown>;

  const { data: files } = await admin
    .from("environment_files")
    .select("*")
    .eq("environment_id", environment.id)
    .in("file_role", ["template", "guidelines"]);

  const templateFile = files?.find((f) => f.file_role === "template") ?? null;
  const guidelinesFile = files?.find((f) => f.file_role === "guidelines") ?? null;

  const { data: learnedRules } = await admin
    .from("environment_learned_rules")
    .select("topic, rule_text")
    .eq("environment_id", environment.id)
    .eq("status", "accepted");

  const { data: chat } = await admin
    .from("contract_chats")
    .select("id")
    .eq("contract_id", contractId)
    .single();
  if (!chat) throw new Error("No chat exists for this contract");

  const { data: history } = await admin
    .from("contract_chat_messages")
    .select("*")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true });

  const systemPrompt = buildDraftingSystemPrompt({
    environmentName: environment.name as string,
    guidelinesText: guidelinesFile?.extracted_text ?? null,
    styleCatalog: templateFile?.extracted_style_catalog ?? null,
    learnedRules: learnedRules ?? [],
    extractedFields: (contract.extracted_fields as Record<string, unknown>) ?? {},
    missingFields: (contract.missing_fields as { field_key: string; reason: string }[]) ?? [],
  });

  const attachmentIds = Array.from(
    new Set((history ?? []).flatMap((m) => (m.attachment_file_ids as string[] | null) ?? [])),
  );
  const attachmentsById = new Map<string, { original_filename: string; extracted_text: string | null }>();
  if (attachmentIds.length > 0) {
    const { data: attachmentFiles } = await admin
      .from("contract_files")
      .select("id, original_filename, extracted_text")
      .in("id", attachmentIds);
    for (const f of attachmentFiles ?? []) attachmentsById.set(f.id, f);
  }

  const messages = (history ?? [])
    .filter((m) => m.role !== "system" && m.content)
    .map((m) => {
      const attachments = ((m.attachment_file_ids as string[] | null) ?? [])
        .map((id) => attachmentsById.get(id))
        .filter((f): f is { original_filename: string; extracted_text: string | null } => Boolean(f));
      const attachmentText = attachments
        .map((f) => `\n\n[קובץ מצורף: ${f.original_filename}]\n${f.extracted_text || "(לא ניתן היה לחלץ טקסט מהקובץ)"}`)
        .join("");
      return {
        role: m.role === "lawyer" ? ("user" as const) : ("assistant" as const),
        content: (m.content as string) + attachmentText,
      };
    });

  // Claude's Messages API requires the conversation to end on a user turn.
  // This is empty on the very first turn, and can also legitimately end on
  // an assistant message when intake had nothing missing and this is called
  // right after the seed message with no lawyer reply yet - both cases need
  // a synthetic nudge appended.
  if (messages.length === 0 || messages[messages.length - 1].role === "assistant") {
    messages.push({ role: "user", content: "(No lawyer message yet - decide whether to ask a clarifying question or, if you already have everything you need, draft the contract now.)" });
  }

  // Mark the contract as actively AI-processing for the duration of the Claude
  // call, so the status badge can distinguish "AI is working right now" from
  // "waiting on the lawyer" - see lib/contracts/statusLabels.ts. Revising vs.
  // drafting only changes the label; a draft already exists past v0.
  const previousStatus = contract.status as string;
  const activeStatus = ((contract.current_draft_version as number) ?? 0) > 0 ? "revising" : "drafting";
  await admin
    .from("contracts")
    .update({ status: activeStatus, updated_at: new Date().toISOString() })
    .eq("id", contractId);

  const claude = createClaudeClient();
  let response;
  try {
    response = await claude.messages.create(
      {
        model: DRAFTING_MODEL,
        max_tokens: 8192,
        system: systemPrompt,
        tools: CHAT_TOOLS,
        tool_choice: { type: "auto" },
        messages,
      },
      { signal },
    );
  } catch (err) {
    // Cancelled by the lawyer - revert to whatever was true before this turn
    // rather than leaving the badge stuck showing "AI is working".
    await admin
      .from("contracts")
      .update({ status: signal?.aborted ? previousStatus : "error", updated_at: new Date().toISOString() })
      .eq("id", contractId);
    throw err;
  }

  await logAiUsage(admin, {
    orgId: contract.org_id as string,
    contractId: contract.id as string,
    purpose: "chat_turn",
    model: DRAFTING_MODEL,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  });

  const newMessages: ChatMessageRow[] = [];

  const textParts = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text);
  if (textParts.length > 0) {
    const { data: row, error } = await admin
      .from("contract_chat_messages")
      .insert({ chat_id: chat.id, org_id: contract.org_id, role: "assistant", content: textParts.join("\n\n") })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    newMessages.push(row);
  }

  for (const block of response.content) {
    if (block.type !== "tool_use") continue;

    if (block.name === "submit_draft") {
      const msg = await handleSubmitDraft(admin, contract, environment, templateFile, block.input as {
        nodes: unknown[];
        filled_fields?: Record<string, unknown>;
        open_issues?: string[];
      });
      newMessages.push(msg);
    } else if (block.name === "propose_guideline_update") {
      const msg = await handleProposeGuidelineUpdate(admin, contract, environment, block.input as {
        topic: string;
        proposed_addition: string;
        rationale: string;
      });
      newMessages.push(msg);
    }
  }

  // If nothing in this turn moved the contract off the "AI is working" status
  // we set above (a clarifying question, a guideline proposal alone, or
  // submit_draft failing because there's no template yet), hand it back to
  // the lawyer rather than leaving the badge stuck mid-processing.
  const { data: currentContract } = await admin.from("contracts").select("status").eq("id", contractId).single();
  if (currentContract?.status === activeStatus) {
    await admin
      .from("contracts")
      .update({ status: "awaiting_info", updated_at: new Date().toISOString() })
      .eq("id", contractId);
  }

  return newMessages;
}

async function handleSubmitDraft(
  admin: SupabaseClient,
  contract: Record<string, unknown>,
  environment: Record<string, unknown>,
  templateFile: Record<string, unknown> | null | undefined,
  input: { nodes: unknown[]; filled_fields?: Record<string, unknown>; open_issues?: string[] },
): Promise<ChatMessageRow> {
  const { data: chat } = await admin.from("contract_chats").select("id").eq("contract_id", contract.id).single();

  if (!templateFile) {
    const { data: row } = await admin
      .from("contract_chat_messages")
      .insert({
        chat_id: chat!.id,
        org_id: contract.org_id,
        role: "assistant",
        content: "לא נמצא קובץ תבנית בסביבת החוזה הזו - לא ניתן להפיק טיוטה בלי תבנית מקורית. יש להעלות תבנית תחילה.",
      })
      .select("*")
      .single();
    return row;
  }

  const envStorage = getEnvironmentStorageProvider(
    { org_id: environment.org_id as string, storage_provider: environment.storage_provider as "supabase" | "google_drive" },
    admin,
  );
  const templateBuffer = await envStorage.download({
    provider: templateFile.storage_provider as "supabase" | "google_drive",
    path: templateFile.storage_path as string,
    driveFileId: templateFile.google_drive_file_id as string | undefined,
  });

  const rendered = await renderDocument(templateBuffer, templateFile.original_filename as string, {
    nodes: input.nodes,
  });

  const contractStorage = getContractStorageProvider(
    { org_id: environment.org_id as string, storage_provider: environment.storage_provider as "supabase" | "google_drive" },
    admin,
  );
  const nextVersion = ((contract.current_draft_version as number) ?? 0) + 1;
  const ref = await contractStorage.upload(environment.org_id as string, contract.id as string, {
    buffer: rendered,
    filename: `draft-v${nextVersion}.docx`,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await admin.from("contract_files").insert({
    contract_id: contract.id,
    org_id: contract.org_id,
    file_role: "draft_version",
    storage_provider: ref.provider,
    storage_path: ref.path,
    google_drive_file_id: ref.driveFileId ?? null,
    original_filename: `draft-v${nextVersion}.docx`,
    mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size_bytes: rendered.byteLength,
    version: nextVersion,
  });

  await admin
    .from("contracts")
    .update({ status: "draft_ready", current_draft_version: nextVersion, updated_at: new Date().toISOString() })
    .eq("id", contract.id);

  const issuesText = input.open_issues?.length
    ? `\n\nנקודות לבדוק לפני שליחה:\n${input.open_issues.map((i) => `- ${i}`).join("\n")}`
    : "";

  const { data: row, error } = await admin
    .from("contract_chat_messages")
    .insert({
      chat_id: chat!.id,
      org_id: contract.org_id,
      role: "assistant",
      content: `הכנתי טיוטה (גרסה ${nextVersion}).${issuesText}`,
      tool_call: { type: "submit_draft", version: nextVersion, storage_path: ref.path },
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return row;
}

async function handleProposeGuidelineUpdate(
  admin: SupabaseClient,
  contract: Record<string, unknown>,
  environment: Record<string, unknown>,
  input: { topic: string; proposed_addition: string; rationale: string },
): Promise<ChatMessageRow> {
  const { data: chat } = await admin.from("contract_chats").select("id").eq("contract_id", contract.id).single();

  const { data: rule, error: ruleError } = await admin
    .from("environment_learned_rules")
    .insert({
      environment_id: environment.id,
      org_id: environment.org_id,
      source_contract_id: contract.id,
      topic: input.topic,
      rule_text: input.proposed_addition,
      status: "proposed",
    })
    .select("id")
    .single();
  if (ruleError) throw new Error(ruleError.message);

  const { data: row, error } = await admin
    .from("contract_chat_messages")
    .insert({
      chat_id: chat!.id,
      org_id: contract.org_id,
      role: "assistant",
      content: `הצעה לעדכון ההנחיות (${input.topic}): ${input.proposed_addition}\n\nלמה: ${input.rationale}`,
      tool_call: { type: "propose_guideline_update", ruleId: rule.id, ...input },
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return row;
}
