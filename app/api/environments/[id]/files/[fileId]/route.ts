import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEnvironment } from "@/lib/db/queries/environments";
import { getEnvironmentStorageProvider } from "@/lib/storage/factory";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id: environmentId, fileId } = await context.params;
  const supabase = await createClient();

  const environment = await getEnvironment(supabase, environmentId);
  if (!environment) return NextResponse.json({ error: "Environment not found" }, { status: 404 });

  const { data: file, error: fileError } = await supabase
    .from("environment_files")
    .select("*")
    .eq("id", fileId)
    .eq("environment_id", environmentId)
    .single();
  if (fileError || !file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const storage = getEnvironmentStorageProvider(environment, supabase);
  const url = await storage.getSignedUrl(
    { provider: file.storage_provider, path: file.storage_path, driveFileId: file.google_drive_file_id ?? undefined },
    300,
  );

  return NextResponse.redirect(url);
}
