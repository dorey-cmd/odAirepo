import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/db/queries/admin";
import { VIEW_AS_STASH_COOKIE, type ViewAsStash } from "@/lib/admin/viewAs";

/**
 * Real session swap, not a proxy: this route mints a genuine session for the
 * target user and writes it as the active auth cookies, so every existing
 * feature in the app (RLS, org scoping, everything) just works "as them"
 * with no special-casing anywhere else. The admin's own session is stashed
 * first (httpOnly, 1h ceiling) so /api/admin/exit-view-as can restore it
 * exactly. See supabase/migrations/0010_view_as.sql for the audit trail.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user: adminUser },
  } = await supabase.auth.getUser();
  if (!adminUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await isPlatformAdmin(supabase))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const targetUserId = body?.targetUserId;
  if (!targetUserId || typeof targetUserId !== "string") {
    return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
  }
  if (targetUserId === adminUser.id) {
    return NextResponse.json({ error: "אי אפשר לצפות כמו עצמך" }, { status: 400 });
  }

  const cookieStore = await cookies();
  if (cookieStore.get(VIEW_AS_STASH_COOKIE)) {
    return NextResponse.json({ error: "כבר במצב View As - יש לחזור לעצמך קודם" }, { status: 409 });
  }

  const {
    data: { session: adminSession },
  } = await supabase.auth.getSession();
  if (!adminSession) return NextResponse.json({ error: "No active session" }, { status: 401 });

  const admin = createAdminClient();
  const { data: targetUserData, error: targetUserError } = await admin.auth.admin.getUserById(targetUserId);
  if (targetUserError || !targetUserData.user?.email) {
    return NextResponse.json({ error: "משתמש היעד לא נמצא" }, { status: 404 });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetUserData.user.email,
  });
  if (linkError || !linkData.properties?.hashed_token) {
    return NextResponse.json({ error: linkError?.message ?? "יצירת קישור נכשלה" }, { status: 500 });
  }

  const stash: ViewAsStash = {
    access_token: adminSession.access_token,
    refresh_token: adminSession.refresh_token,
    adminUserId: adminUser.id,
    adminEmail: adminUser.email ?? adminUser.id,
    targetEmail: targetUserData.user.email,
  };
  cookieStore.set(VIEW_AS_STASH_COOKIE, JSON.stringify(stash), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60, // 1h ceiling on any single View As session
  });

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) {
    cookieStore.delete(VIEW_AS_STASH_COOKIE);
    return NextResponse.json({ error: verifyError.message }, { status: 500 });
  }

  await admin.from("admin_impersonation_log").insert({ admin_user_id: adminUser.id, target_user_id: targetUserId });

  return NextResponse.json({ ok: true });
}
