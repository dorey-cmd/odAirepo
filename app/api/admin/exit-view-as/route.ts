import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VIEW_AS_STASH_COOKIE, type ViewAsStash } from "@/lib/admin/viewAs";

/** Restores the admin's own stashed session, ending the active View As. */
export async function POST() {
  const cookieStore = await cookies();
  const stashRaw = cookieStore.get(VIEW_AS_STASH_COOKIE)?.value;
  if (!stashRaw) return NextResponse.json({ error: "לא נמצא סשן admin לשחזור" }, { status: 400 });

  let stash: ViewAsStash;
  try {
    stash = JSON.parse(stashRaw);
  } catch {
    cookieStore.delete(VIEW_AS_STASH_COOKIE);
    return NextResponse.json({ error: "סשן admin פגום" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token: stash.access_token,
    refresh_token: stash.refresh_token,
  });
  cookieStore.delete(VIEW_AS_STASH_COOKIE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const admin = createAdminClient();
  await admin
    .from("admin_impersonation_log")
    .update({ ended_at: new Date().toISOString() })
    .eq("admin_user_id", stash.adminUserId)
    .is("ended_at", null);

  return NextResponse.json({ ok: true });
}
