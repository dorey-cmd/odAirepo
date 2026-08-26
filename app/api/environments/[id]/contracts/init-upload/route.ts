import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEnvironment } from "@/lib/db/queries/environments";
import { getEnvironmentStorageProvider } from "@/lib/storage/factory";
import { validateIntakeFile } from "@/lib/storage/fileRules";

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
  const { filename, mimeType, sizeBytes } = body ?? {};
  if (!filename || !mimeType || typeof sizeBytes !== "number") {
    return NextResponse.json({ error: "filename, mimeType, and sizeBytes are required" }, { status: 400 });
  }

  const validationError = validateIntakeFile(filename, mimeType, sizeBytes);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const storage = getEnvironmentStorageProvider(environment, supabase);
  try {
    const ticket = await storage.createUploadTicket(environment.org_id, environment.id, filename, mimeType);
    return NextResponse.json({ ticket });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
