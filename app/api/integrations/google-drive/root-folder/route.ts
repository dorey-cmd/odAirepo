import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/queries/orgs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.folderId) return NextResponse.json({ error: "folderId is required" }, { status: 400 });

  const orgId = await getCurrentOrgId(supabase);
  const { error } = await supabase
    .from("storage_connections")
    .update({ drive_root_folder_id: body.folderId, updated_at: new Date().toISOString() })
    .eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
