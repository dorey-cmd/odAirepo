import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContractStorageProvider } from "@/lib/storage/factory";
import { validateFile } from "@/lib/storage/fileRules";

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
  const { filename, mimeType, sizeBytes } = body ?? {};
  if (!filename || !mimeType || typeof sizeBytes !== "number") {
    return NextResponse.json({ error: "filename, mimeType, and sizeBytes are required" }, { status: 400 });
  }

  const validationError = validateFile(filename, mimeType, sizeBytes);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const environment = contract.contract_environments as unknown as { storage_provider: "supabase" | "google_drive" };
  const storage = getContractStorageProvider({ org_id: contract.org_id, storage_provider: environment.storage_provider }, supabase);
  try {
    const ticket = await storage.createUploadTicket(contract.org_id, contract.id, filename, mimeType);
    return NextResponse.json({ ticket });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
