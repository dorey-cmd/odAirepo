import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContractStorageProvider } from "@/lib/storage/factory";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id: contractId, fileId } = await context.params;
  const supabase = await createClient();

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, org_id, contract_environments(storage_provider)")
    .eq("id", contractId)
    .single();
  if (contractError || !contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const { data: file, error: fileError } = await supabase
    .from("contract_files")
    .select("*")
    .eq("id", fileId)
    .eq("contract_id", contractId)
    .single();
  if (fileError || !file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const environment = contract.contract_environments as unknown as { storage_provider: "supabase" | "google_drive" };
  const storage = getContractStorageProvider(
    { org_id: contract.org_id, storage_provider: environment.storage_provider },
    supabase,
  );

  const url = await storage.getSignedUrl(
    { provider: file.storage_provider, path: file.storage_path, driveFileId: file.google_drive_file_id ?? undefined },
    300,
  );

  return NextResponse.redirect(url);
}
