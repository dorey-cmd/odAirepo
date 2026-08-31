import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContractStorageProvider } from "@/lib/storage/factory";

/** Archives or unarchives a contract - a safe, reversible way to get it out of the way without losing anything. */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: contractId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (body?.status !== "archived" && body?.status !== "awaiting_info") {
    return NextResponse.json({ error: "status must be 'archived' (to archive) or 'awaiting_info' (to unarchive)" }, { status: 400 });
  }

  // RLS-scoped - no rows means this contract isn't in the caller's org.
  const { data, error } = await supabase
    .from("contracts")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", contractId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

/** Permanently deletes a contract - chat, messages, and file rows cascade; storage objects are removed first since those don't. */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: contractId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // RLS-scoped read - throws no rows if this contract isn't in the caller's org.
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, org_id, contract_environments(storage_provider)")
    .eq("id", contractId)
    .single();
  if (contractError || !contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const { data: files } = await supabase
    .from("contract_files")
    .select("storage_provider, storage_path, google_drive_file_id")
    .eq("contract_id", contractId);

  if (files && files.length > 0) {
    const environment = contract.contract_environments as unknown as { storage_provider: "supabase" | "google_drive" };
    const storage = getContractStorageProvider(
      { org_id: contract.org_id, storage_provider: environment.storage_provider },
      supabase,
    );
    for (const f of files) {
      await storage
        .delete({ provider: f.storage_provider, path: f.storage_path, driveFileId: f.google_drive_file_id ?? undefined })
        .catch((err) => console.error(`Failed to delete storage object for contract ${contractId}:`, err));
    }
  }

  const { error: deleteError } = await supabase.from("contracts").delete().eq("id", contractId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
