import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/db/queries/admin";
import { getContractStorageProvider, getEnvironmentStorageProvider } from "@/lib/storage/factory";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id: contractId, fileId } = await context.params;
  const supabase = await createClient();

  // Same admin-view fallback as the contract detail page - see its comment.
  let client = supabase;
  let contract = await client
    .from("contracts")
    .select("id, org_id, contract_environments(storage_provider)")
    .eq("id", contractId)
    .maybeSingle()
    .then((r) => r.data);
  if (!contract && (await isPlatformAdmin(supabase))) {
    client = createAdminClient();
    contract = await client
      .from("contracts")
      .select("id, org_id, contract_environments(storage_provider)")
      .eq("id", contractId)
      .maybeSingle()
      .then((r) => r.data);
  }
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const { data: file, error: fileError } = await client
    .from("contract_files")
    .select("*")
    .eq("id", fileId)
    .eq("contract_id", contractId)
    .single();
  if (fileError || !file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const environment = contract.contract_environments as unknown as { storage_provider: "supabase" | "google_drive" };
  // Intake-upload files physically live in the environment's storage bucket
  // (they're downloaded from there during intake, never copied) - every
  // other role (draft_version, supporting_upload) lives in the contract's
  // own bucket. See lib/webhooks/intakeProcessor.ts.
  const getProvider = file.file_role === "intake_upload" ? getEnvironmentStorageProvider : getContractStorageProvider;
  const storage = getProvider({ org_id: contract.org_id, storage_provider: environment.storage_provider }, client);

  const url = await storage.getSignedUrl(
    { provider: file.storage_provider, path: file.storage_path, driveFileId: file.google_drive_file_id ?? undefined },
    300,
    file.original_filename,
  );

  return NextResponse.redirect(url);
}
