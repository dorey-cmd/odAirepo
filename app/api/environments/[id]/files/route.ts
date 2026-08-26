import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEnvironment } from "@/lib/db/queries/environments";
import { getEnvironmentStorageProvider } from "@/lib/storage/factory";
import { extractText } from "@/lib/parsing/extractText";
import { extractStyleCatalog } from "@/lib/rendering/documentRenderClient";
import type { EnvironmentFileRole } from "@/types/environment";

const VALID_ROLES: EnvironmentFileRole[] = [
  "template",
  "guidelines",
  "reference",
  "font",
  "exhibit",
  "other",
];

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: environmentId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const environment = await getEnvironment(supabase, environmentId);
  if (!environment) return NextResponse.json({ error: "Environment not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const fileRole = form.get("file_role");
  if (!(file instanceof File) || typeof fileRole !== "string" || !VALID_ROLES.includes(fileRole as EnvironmentFileRole)) {
    return NextResponse.json({ error: "file and a valid file_role are required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  const storage = getEnvironmentStorageProvider(environment, supabase);
  const ref = await storage.upload(environment.org_id, environment.id, {
    buffer,
    filename: file.name,
    mimeType,
  });

  const extractedText = await extractText(buffer, mimeType, file.name).catch(() => "");

  let extractedStyleCatalog: unknown = null;
  if (fileRole === "template" && file.name.toLowerCase().endsWith(".docx")) {
    // Best-effort — the rendering service may not be reachable in every
    // environment (e.g. local dev without it running); template files can
    // still be uploaded and re-analyzed later.
    extractedStyleCatalog = await extractStyleCatalog(buffer, file.name).catch((err) => {
      console.error("extractStyleCatalog failed:", err);
      return null;
    });
  }

  const { data, error } = await supabase
    .from("environment_files")
    .insert({
      environment_id: environment.id,
      org_id: environment.org_id,
      file_role: fileRole,
      storage_provider: ref.provider,
      storage_path: ref.path,
      google_drive_file_id: ref.driveFileId ?? null,
      original_filename: file.name,
      mime_type: mimeType,
      size_bytes: buffer.byteLength,
      extracted_text: extractedText,
      extracted_style_catalog: extractedStyleCatalog,
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ file: data }, { status: 201 });
}
