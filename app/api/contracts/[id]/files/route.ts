import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContractStorageProvider } from "@/lib/storage/factory";
import { extractText } from "@/lib/parsing/extractText";
import { validateFile } from "@/lib/storage/fileRules";
import type { StorageRef } from "@/lib/storage/types";

/**
 * Finalizes a chat-attached (or otherwise contract-scoped) file upload -
 * mirrors app/api/environments/[id]/files/route.ts. Runs the same
 * extractText pipeline, so an attached audio recording gets transcribed
 * and an attached PDF/Word doc gets its text pulled, before the lawyer
 * even sends the chat message referencing it.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: contractId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, org_id, contract_environments(storage_provider)")
    .eq("id", contractId)
    .single();
  if (contractError || !contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

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

  const validationError = validateFile(originalFilename, mimeType, sizeBytes);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const environment = contract.contract_environments as unknown as { storage_provider: "supabase" | "google_drive" };
  const storage = getContractStorageProvider({ org_id: contract.org_id, storage_provider: environment.storage_provider }, supabase);
  const ref: StorageRef = driveFileId ? { provider: "google_drive", path: "", driveFileId } : { provider: "supabase", path };

  let extractedText = "";
  try {
    const buffer = await storage.download(ref);
    extractedText = await extractText(buffer, mimeType, originalFilename).catch((err) => {
      console.error(`extractText failed for ${originalFilename}:`, err);
      return "";
    });
  } catch (err) {
    console.error("post-upload extraction failed:", err);
  }

  const { data, error } = await supabase
    .from("contract_files")
    .insert({
      contract_id: contract.id,
      org_id: contract.org_id,
      file_role: "supporting_upload",
      storage_provider: ref.provider,
      storage_path: ref.path || null,
      google_drive_file_id: ref.driveFileId ?? null,
      original_filename: originalFilename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      extracted_text: extractedText,
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ file: data }, { status: 201 });
}
