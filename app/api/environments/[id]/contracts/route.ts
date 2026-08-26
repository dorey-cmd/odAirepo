import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnvironment } from "@/lib/db/queries/environments";
import { validateIntakeFile } from "@/lib/storage/fileRules";
import { processIntakeEvent } from "@/lib/webhooks/intakeProcessor";

/**
 * Starts a new contract from a lawyer-uploaded PDF/Word document — the
 * manual-upload counterpart to the generic webhook (see plan's original
 * "or a PDF the lawyer can upload" requirement). Reuses the exact same
 * field-extraction + contract + chat pipeline as webhook intake.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: environmentId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const environment = await getEnvironment(supabase, environmentId);
  if (!environment) return NextResponse.json({ error: "Environment not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const {
    path,
    drive_file_id: driveFileId,
    original_filename: originalFilename,
    mime_type: mimeType,
    size_bytes: sizeBytes,
  } = body ?? {};

  if ((!path && !driveFileId) || !originalFilename || !mimeType || typeof sizeBytes !== "number") {
    return NextResponse.json(
      { error: "path (or drive_file_id), original_filename, mime_type, and size_bytes are required" },
      { status: 400 },
    );
  }

  const validationError = validateIntakeFile(originalFilename, mimeType, sizeBytes);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const admin = createAdminClient();
  const { data: event, error: insertError } = await admin
    .from("webhook_intake_events")
    .insert({
      environment_id: environment.id,
      org_id: environment.org_id,
      content_type: mimeType,
      raw_payload: null,
      raw_files: [
        {
          filename: originalFilename,
          mime_type: mimeType,
          storage_path: path || undefined,
          drive_file_id: driveFileId || undefined,
          provider: driveFileId ? "google_drive" : "supabase",
        },
      ],
      verified: true,
      processing_status: "received",
      source: "manual_upload",
    })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Interactive, lawyer-initiated — await it so we can hand back the new
  // contract's id to redirect to (unlike the public webhook, which returns
  // fast and processes via after()).
  await processIntakeEvent(event.id);

  const { data: finalEvent, error: fetchError } = await admin
    .from("webhook_intake_events")
    .select("contract_id, processing_status, error_message")
    .eq("id", event.id)
    .single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (finalEvent.processing_status === "error") {
    return NextResponse.json({ error: finalEvent.error_message ?? "עיבוד הקובץ נכשל" }, { status: 500 });
  }

  return NextResponse.json({ contractId: finalEvent.contract_id }, { status: 201 });
}
