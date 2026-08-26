import { createAdminClient } from "@/lib/supabase/admin";
import { getEnvironmentStorageProvider } from "@/lib/storage/factory";
import { extractText } from "@/lib/parsing/extractText";
import { extractFields, type FieldDefinitionForExtraction } from "@/lib/ai/fieldExtraction";
import { runChatTurn } from "@/lib/ai/chatEngine";
import { logAiUsage } from "@/lib/ai/usageLog";
import { EXTRACTION_MODEL } from "@/lib/ai/claudeClient";

/**
 * Turns a logged webhook_intake_events row into a contract + its dedicated
 * chat. See plan §"Webhook Intake Pipeline". Called via Next.js `after()`
 * from the webhook route so the caller gets a fast 202 without waiting on
 * Claude — see app/api/webhooks/contracts/[environmentId]/route.ts.
 */
export async function processIntakeEvent(eventId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: event, error: eventError } = await admin
    .from("webhook_intake_events")
    .select("*, contract_environments(*)")
    .eq("id", eventId)
    .single();
  if (eventError || !event) throw new Error(`Intake event not found: ${eventError?.message}`);

  const environment = event.contract_environments as Record<string, unknown>;

  try {
    await admin.from("webhook_intake_events").update({ processing_status: "processing" }).eq("id", eventId);

    const { data: fieldDefs } = await admin
      .from("environment_field_definitions")
      .select("field_key, label, data_type, is_required, description, extraction_hints")
      .eq("environment_id", environment.id);

    const fileTexts: { filename: string; text: string }[] = [];
    const rawFiles = (event.raw_files as { filename: string; mime_type: string; storage_path: string }[]) ?? [];
    if (rawFiles.length > 0) {
      const storage = getEnvironmentStorageProvider(
        { org_id: event.org_id, storage_provider: environment.storage_provider as "supabase" | "google_drive" },
        admin,
      );
      for (const f of rawFiles) {
        try {
          const buffer = await storage.download({ provider: "supabase", path: f.storage_path });
          const text = await extractText(buffer, f.mime_type, f.filename);
          fileTexts.push({ filename: f.filename, text });
        } catch (err) {
          console.error(`Could not extract text from ${f.filename}:`, err);
        }
      }
    }

    let extracted: { field_key: string; value: string; confidence: number }[] = [];
    let missing: { field_key: string; reason: string }[] = [];
    let extractionUsage: { input_tokens: number; output_tokens: number } | null = null;

    if (fieldDefs && fieldDefs.length > 0) {
      const result = await extractFields({
        fieldDefinitions: fieldDefs as FieldDefinitionForExtraction[],
        rawPayload: event.raw_payload,
        fileTexts,
      });
      extracted = result.extracted;
      missing = result.missing.filter((m) =>
        fieldDefs.some((fd) => fd.field_key === m.field_key && fd.is_required),
      );
      extractionUsage = result.usage;
    }

    // No field schema defined yet for this environment — still hand the raw
    // intake data + file text through to drafting context rather than
    // discarding it; there's just no structured gap-detection to run.
    const extractedFieldsObj: Record<string, unknown> =
      fieldDefs && fieldDefs.length > 0
        ? Object.fromEntries(extracted.map((e) => [e.field_key, e.value]))
        : {
            ...(typeof event.raw_payload === "object" && event.raw_payload !== null ? event.raw_payload : {}),
            ...(fileTexts.length > 0
              ? { _uploaded_file_text: fileTexts.map((f) => `[${f.filename}]\n${f.text}`).join("\n\n") }
              : {}),
          };

    const { data: contract, error: contractError } = await admin
      .from("contracts")
      .insert({
        environment_id: environment.id,
        org_id: event.org_id,
        title: `${environment.name} — ${new Date().toLocaleDateString("he-IL")}`,
        status: missing.length > 0 ? "awaiting_info" : "drafting",
        intake_source: "webhook",
        raw_intake_event_id: eventId,
        extracted_fields: extractedFieldsObj,
        missing_fields: missing,
      })
      .select("*")
      .single();
    if (contractError) throw new Error(contractError.message);

    if (extractionUsage) {
      await logAiUsage(admin, {
        orgId: event.org_id,
        contractId: contract.id,
        purpose: "field_extraction",
        model: EXTRACTION_MODEL,
        usage: extractionUsage,
      });
    }

    const { data: chat, error: chatError } = await admin
      .from("contract_chats")
      .insert({ contract_id: contract.id, org_id: event.org_id })
      .select("*")
      .single();
    if (chatError) throw new Error(chatError.message);

    const seedText =
      missing.length > 0
        ? `קיבלתי בקשה חדשה ליצירת חוזה. זיהיתי ${extracted.length} פרטים מתוך ${fieldDefs?.length ?? 0}. ` +
          `חסרים לי עדיין:\n${missing.map((m) => `- ${m.field_key}: ${m.reason}`).join("\n")}\n\n` +
          `אפשר לענות כאן בצ'אט, או להעלות מסמך שמכיל את הפרטים החסרים.`
        : `קיבלתי את כל הפרטים הנדרשים ליצירת החוזה. מתחיל להכין טיוטה...`;

    await admin.from("contract_chat_messages").insert({
      chat_id: chat.id,
      org_id: event.org_id,
      role: "assistant",
      content: seedText,
    });

    await admin
      .from("webhook_intake_events")
      .update({ processing_status: "contract_created", contract_id: contract.id })
      .eq("id", eventId);

    if (missing.length === 0) {
      await runChatTurn(admin, contract.id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`processIntakeEvent(${eventId}) failed:`, err);
    await admin
      .from("webhook_intake_events")
      .update({ processing_status: "error", error_message: message })
      .eq("id", eventId);
  }
}
