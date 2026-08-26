import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEnvironment } from "@/lib/db/queries/environments";
import { getEnvironmentStorageProvider } from "@/lib/storage/factory";
import { GoogleDriveStorageProvider } from "@/lib/storage/providers/googleDriveProvider";
import { extractText } from "@/lib/parsing/extractText";
import { extractStyleCatalog } from "@/lib/rendering/documentRenderClient";
import { validateFile } from "@/lib/storage/fileRules";
import type { StorageRef } from "@/lib/storage/types";
import type { EnvironmentFileRole } from "@/types/environment";

const VALID_ROLES: EnvironmentFileRole[] = [
  "template",
  "guidelines",
  "reference",
  "font",
  "exhibit",
  "other",
];

/**
 * Finalizes an upload that already landed in storage via a signed upload
 * ticket (see init-upload/route.ts) — downloads it back to run text/style
 * extraction, then creates the DB row. The file itself never passes through
 * this route, so it isn't subject to Vercel's ~4.5MB request body limit.
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
    file_role: fileRole,
    original_filename: originalFilename,
    mime_type: mimeType,
    size_bytes: sizeBytes,
  } = body ?? {};

  if (
    (!path && !driveFileId) ||
    typeof fileRole !== "string" ||
    !VALID_ROLES.includes(fileRole as EnvironmentFileRole) ||
    !originalFilename ||
    !mimeType ||
    typeof sizeBytes !== "number"
  ) {
    return NextResponse.json(
      { error: "path (or drive_file_id), file_role, original_filename, mime_type, and size_bytes are required" },
      { status: 400 },
    );
  }

  const validationError = validateFile(originalFilename, mimeType, sizeBytes);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const storage = getEnvironmentStorageProvider(environment, supabase);
  const ref: StorageRef = driveFileId
    ? { provider: "google_drive", path: "", driveFileId }
    : { provider: "supabase", path };

  if (driveFileId && storage instanceof GoogleDriveStorageProvider) {
    await storage.finalizeUploadedFile(environment.id, driveFileId).catch((err) => {
      console.error("Drive permission replication failed:", err);
    });
  }

  let extractedText = "";
  let extractedStyleCatalog: unknown = null;
  try {
    const buffer = await storage.download(ref);
    extractedText = await extractText(buffer, mimeType, originalFilename).catch(() => "");

    if (fileRole === "template" && originalFilename.toLowerCase().endsWith(".docx")) {
      // Best-effort — the rendering service may not be reachable in every
      // environment (e.g. local dev without it running); template files can
      // still be uploaded and re-analyzed later.
      extractedStyleCatalog = await extractStyleCatalog(buffer, originalFilename).catch((err) => {
        console.error("extractStyleCatalog failed:", err);
        return null;
      });
    }
  } catch (err) {
    console.error("post-upload extraction failed:", err);
  }

  const { data, error } = await supabase
    .from("environment_files")
    .insert({
      environment_id: environment.id,
      org_id: environment.org_id,
      file_role: fileRole,
      storage_provider: ref.provider,
      storage_path: ref.path || null,
      google_drive_file_id: ref.driveFileId ?? null,
      original_filename: originalFilename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      extracted_text: extractedText,
      extracted_style_catalog: extractedStyleCatalog,
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ file: data }, { status: 201 });
}
