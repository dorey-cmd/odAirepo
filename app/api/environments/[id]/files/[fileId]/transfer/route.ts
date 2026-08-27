import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEnvironment } from "@/lib/db/queries/environments";
import { getEnvironmentStorageProvider } from "@/lib/storage/factory";

/**
 * Copies or moves an environment file to a different environment (same org,
 * enforced by RLS on both the source and target lookups). Downloads the
 * bytes through the source environment's storage provider and re-uploads
 * through the target's, since the two environments may use different
 * providers (e.g. Supabase -> Google Drive) - a DB-only reparent would leave
 * the file physically stranded in the wrong provider/scope.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  const { id: environmentId, fileId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const targetEnvironmentId = body?.targetEnvironmentId as string | undefined;
  const mode = body?.mode as "copy" | "move" | undefined;
  if (!targetEnvironmentId || (mode !== "copy" && mode !== "move")) {
    return NextResponse.json({ error: "targetEnvironmentId and mode ('copy' | 'move') are required" }, { status: 400 });
  }
  if (targetEnvironmentId === environmentId) {
    return NextResponse.json({ error: "הסביבה היעד זהה לסביבת המקור" }, { status: 400 });
  }

  const [sourceEnv, targetEnv] = await Promise.all([
    getEnvironment(supabase, environmentId),
    getEnvironment(supabase, targetEnvironmentId),
  ]);
  if (!sourceEnv) return NextResponse.json({ error: "Source environment not found" }, { status: 404 });
  if (!targetEnv) return NextResponse.json({ error: "Target environment not found" }, { status: 404 });

  const { data: file, error: fileError } = await supabase
    .from("environment_files")
    .select("*")
    .eq("id", fileId)
    .eq("environment_id", environmentId)
    .single();
  if (fileError || !file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const sourceStorage = getEnvironmentStorageProvider(sourceEnv, supabase);
  const targetStorage = getEnvironmentStorageProvider(targetEnv, supabase);

  const buffer = await sourceStorage.download({
    provider: file.storage_provider,
    path: file.storage_path,
    driveFileId: file.google_drive_file_id ?? undefined,
  });

  const ref = await targetStorage.upload(targetEnv.org_id, targetEnv.id, {
    buffer,
    filename: file.original_filename,
    mimeType: file.mime_type ?? "application/octet-stream",
  });

  const { data: newFile, error: insertError } = await supabase
    .from("environment_files")
    .insert({
      environment_id: targetEnv.id,
      org_id: targetEnv.org_id,
      file_role: file.file_role,
      storage_provider: ref.provider,
      storage_path: ref.path || null,
      google_drive_file_id: ref.driveFileId ?? null,
      original_filename: file.original_filename,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      extracted_text: file.extracted_text,
      extracted_style_catalog: file.extracted_style_catalog,
      uploaded_by: user.id,
    })
    .select("*")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  if (mode === "move") {
    await sourceStorage
      .delete({ provider: file.storage_provider, path: file.storage_path, driveFileId: file.google_drive_file_id ?? undefined })
      .catch((err) => console.error(`Failed to delete original storage object for file ${fileId}:`, err));
    const { error: deleteError } = await supabase.from("environment_files").delete().eq("id", fileId);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ file: newFile }, { status: 201 });
}
