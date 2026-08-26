import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/queries/orgs";
import { createEnvironment, listEnvironments } from "@/lib/db/queries/environments";

export async function GET() {
  const supabase = await createClient();
  try {
    const environments = await listEnvironments(supabase);
    return NextResponse.json({ environments });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (body.storage_provider && !["supabase", "google_drive"].includes(body.storage_provider)) {
    return NextResponse.json({ error: "invalid storage_provider" }, { status: 400 });
  }

  try {
    const orgId = await getCurrentOrgId(supabase);
    const environment = await createEnvironment(supabase, {
      orgId,
      name: body.name,
      description: body.description,
      createdBy: user.id,
      storageProvider: body.storage_provider,
    });
    return NextResponse.json({ environment }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
