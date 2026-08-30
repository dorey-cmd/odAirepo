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

interface DraftSectionToolCall {
  type: "submit_draft_section";
  section_title: string | null;
  nodes: unknown[];
  is_final_section: boolean;
  filled_fields: Record<string, unknown> | null;
  open_issues: string[] | null;
}

/**
 * Runs one AI turn for a contract's chat: builds context from the environment's
 * template/guidelines/learned rules + full chat history, calls Claude, and
 * persists whatever it produces (a clarifying question, one section of a draft,
 * a completed draft, or a proposed guideline update). See plan §"AI Drafting,
 * Chat & Learning Loop".
 *
 * Simplification vs. the plan: tool calls are summarized into plain assistant
 * text for history replay rather than replayed as literal tool_use/tool_result
 * blocks - each turn is a fresh decision informed by the full text history and
 * current contract state, not a strict multi-turn tool-use conversation.
 *
 * Drafting is section-by-section (see submit_draft_section in lib/ai/tools.ts)
 * rather than one giant call for the whole document: a real multi-page
 * contract's full node tree can need far more tokens and wall-clock time than
 * is safe for a single request, which previously failed silently (truncated
 * output, or the request just timing out) with no error and no draft. Each
 * turn produces at most the sections the model can comfortably fit in one
 * response; the caller (the chat route, then the continue-draft route) keeps
 * calling this function turn after turn - with no lawyer input needed - until
 * a final section arrives and the accumulated sections are rendered together.
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

  // Everything submitted so far in the CURRENT (not yet finalized) drafting
  // pass, so a continuation turn can see the actual document it has already
  // written - not just a one-line label - and keep the whole thing coherent
  // (consistent terms, no duplicated or contradicted sections) no matter how
  // many turns the full draft takes.
  const pendingSections = extractPendingSections(history ?? []);

  const systemPrompt = buildDraftingSystemPrompt({
    environmentName: environment.name as string,
    guidelinesText: guidelinesFile?.extracted_text ?? null,
    styleCatalog: templateFile?.extracted_style_catalog ?? null,
    learnedRules: learnedRules ?? [],
    extractedFields: (contract.extracted_fields as Record<string, unknown>) ?? {},
    missingFields: (contract.missing_fields as { field_key: string; reason: string }[]) ?? [],
    draftInProgress: pendingSections.nodes.length > 0 ? pendingSections : undefined,
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
  // This is empty on the very first turn, and can also legitimately end on an
  // assistant message either right after intake's seed message (no lawyer
  // reply yet) or mid-way through a multi-section draft (the previous turn
  // submitted a non-final section and needs to continue) - the nudge differs
  // so the model doesn't restart or repeat sections.
  const lastHistoryMsg = history?.[history.length - 1];
  const lastToolCall = lastHistoryMsg?.tool_call as DraftSectionToolCall | null | undefined;
  const isContinuingSection =
    lastHistoryMsg?.role === "assistant" &&
    lastToolCall?.type === "submit_draft_section" &&
    lastToolCall.is_final_section === false;

  if (messages.length === 0 || messages[messages.length - 1].role === "assistant") {
    messages.push({
      role: "user",
      content: isContinuingSection
        ? "(Continue drafting - review the DRAFT SO FAR above, then submit the next section via submit_draft_section. Do not repeat or re-cover anything already there.)"
        : "(No lawyer message yet - decide whether to ask a clarifying question or, if you already have everything you need, draft the contract now.)",
    });
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
    // Each turn produces at most a few sections, not the whole document, so
    // this only needs enough budget for that - see submit_draft_section.
    const stream = claude.messages.stream(
      {
        model: DRAFTING_MODEL,
        max_tokens: 16000,
        system: systemPrompt,
        tools: CHAT_TOOLS,
        tool_choice: { type: "auto" },
        messages,
      },
      { signal },
    );
    response = await stream.finalMessage();
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

  if (response.stop_reason === "max_tokens") {
    // Even one section's budget wasn't enough - surface this to the lawyer
    // instead of silently dropping the turn (the original bug: no message,
    // no draft, status quietly reset to "awaiting_info" as if nothing happened).
    const { data: row, error } = await admin
      .from("contract_chat_messages")
      .insert({
        chat_id: chat.id,
        org_id: contract.org_id,
        role: "assistant",
        content: "התגובה הייתה ארוכה מדי ונקטעה באמצע - לא הופק חלק מהטיוטה. כדאי לנסות שוב, או לפנות לתמיכה אם זה חוזר על עצמו.",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await admin
      .from("contracts")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", contractId);
    return [row];
  }

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

  // True while a non-final section landed this turn - more turns are needed
  // to finish the draft, with no lawyer input required, so the "hand it back
  // to the lawyer" fallback below must not fire.
  let sectionInProgress = false;

  for (const block of response.content) {
    if (block.type !== "tool_use") continue;

    if (block.name === "submit_draft_section") {
      const input = block.input as {
        section_title?: string;
        nodes: unknown[];
        is_final_section: boolean;
        filled_fields?: Record<string, unknown>;
        open_issues?: string[];
      };
      const rows = await handleSubmitDraftSection(admin, contract, environment, templateFile, chat.id, input);
      newMessages.push(...rows);
      if (!input.is_final_section) sectionInProgress = true;
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
  // we set above (a clarifying question, a guideline proposal alone, or a
  // final section failing because there's no template yet) AND a multi-turn
  // draft isn't mid-flight, hand it back to the lawyer rather than leaving
  // the badge stuck mid-processing.
  if (!sectionInProgress) {
    const { data: currentContract } = await admin.from("contracts").select("status").eq("id", contractId).single();
    if (currentContract?.status === activeStatus) {
      await admin
        .from("contracts")
        .update({ status: "awaiting_info", updated_at: new Date().toISOString() })
        .eq("id", contractId);
    }
  }

  return newMessages;
}

/** All submit_draft_section calls since the last completed draft, in submission order - pure function over already-loaded rows. */
function extractPendingSections(
  rows: { tool_call: unknown }[],
): { nodes: unknown[]; filled_fields: Record<string, unknown>; open_issues: string[] } {
  const sectionCalls = rows
    .map((m) => m.tool_call as DraftSectionToolCall | null)
    .filter((tc): tc is DraftSectionToolCall => tc?.type === "submit_draft_section");
  const lastFinalIdx = sectionCalls.map((tc) => tc.is_final_section).lastIndexOf(true);
  const pending = lastFinalIdx === -1 ? sectionCalls : sectionCalls.slice(lastFinalIdx + 1);

  return {
    nodes: pending.flatMap((tc) => tc.nodes ?? []),
    filled_fields: Object.assign({}, ...pending.map((tc) => tc.filled_fields ?? {})),
    open_issues: pending.flatMap((tc) => tc.open_issues ?? []),
  };
}

/** Same as extractPendingSections, but re-fetches fresh - used right after inserting the final section itself. */
async function collectPendingSections(
  admin: SupabaseClient,
  chatId: string,
): Promise<{ nodes: unknown[]; filled_fields: Record<string, unknown>; open_issues: string[] }> {
  const { data: msgs } = await admin
    .from("contract_chat_messages")
    .select("tool_call, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  return extractPendingSections(msgs ?? []);
}

async function handleSubmitDraftSection(
  admin: SupabaseClient,
  contract: Record<string, unknown>,
  environment: Record<string, unknown>,
  templateFile: Record<string, unknown> | null | undefined,
  chatId: string,
  input: { section_title?: string; nodes: unknown[]; is_final_section: boolean; filled_fields?: Record<string, unknown>; open_issues?: string[] },
): Promise<ChatMessageRow[]> {
  const { data: sectionRow, error: sectionError } = await admin
    .from("contract_chat_messages")
    .insert({
      chat_id: chatId,
      org_id: contract.org_id,
      role: "assistant",
      content: input.is_final_section
        ? `הכנתי את החלק האחרון${input.section_title ? ` (${input.section_title})` : ""}. מרכיבה את הטיוטה המלאה...`
        : `הכנתי חלק${input.section_title ? `: ${input.section_title}` : ""}. ממשיכה לחלק הבא...`,
      tool_call: {
        type: "submit_draft_section",
        section_title: input.section_title ?? null,
        nodes: input.nodes,
        is_final_section: input.is_final_section,
        filled_fields: input.filled_fields ?? null,
        open_issues: input.open_issues ?? null,
      },
    })
    .select("*")
    .single();
  if (sectionError) throw new Error(sectionError.message);

  if (!input.is_final_section) return [sectionRow];

  const pending = await collectPendingSections(admin, chatId);
  const finalRow = await finalizeDraft(admin, contract, environment, templateFile, chatId, pending);
  return [sectionRow, finalRow];
}

async function finalizeDraft(
  admin: SupabaseClient,
  contract: Record<string, unknown>,
  environment: Record<string, unknown>,
  templateFile: Record<string, unknown> | null | undefined,
  chatId: string,
  sections: { nodes: unknown[]; filled_fields: Record<string, unknown>; open_issues: string[] },
): Promise<ChatMessageRow> {
  if (!templateFile) {
    const { data: row } = await admin
      .from("contract_chat_messages")
      .insert({
        chat_id: chatId,
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
    nodes: sections.nodes,
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

  const issuesText = sections.open_issues.length > 0
    ? `\n\nנקודות לבדוק לפני שליחה:\n${sections.open_issues.map((i) => `- ${i}`).join("\n")}`
    : "";

  const { data: row, error } = await admin
    .from("contract_chat_messages")
    .insert({
      chat_id: chatId,
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
