import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/db/queries/admin";
import ViewAsUserList from "./ViewAsUserList";

export default async function ViewAsPage() {
  const supabase = await createClient();
  if (!(await isPlatformAdmin(supabase))) notFound();

  const admin = createAdminClient();
  const [{ data: usersPage }, { data: members }, { data: orgs }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 200 }),
    admin.from("org_members").select("user_id, org_id"),
    admin.from("orgs").select("id, name"),
  ]);

  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const orgNamesByUser = new Map<string, string[]>();
  for (const m of members ?? []) {
    const name = orgNameById.get(m.org_id);
    if (!name) continue;
    const list = orgNamesByUser.get(m.user_id) ?? [];
    list.push(name);
    orgNamesByUser.set(m.user_id, list);
  }

  const users = (usersPage?.users ?? [])
    .filter((u) => u.email)
    .map((u) => ({ id: u.id, email: u.email as string, orgNames: orgNamesByUser.get(u.id) ?? [] }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="stack">
      <div>
        <Link href="/admin" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          ← חזרה לניהול מערכת
        </Link>
        <h1 style={{ marginTop: "0.25rem" }}>View As</h1>
        <p style={{ color: "var(--text-muted)", marginTop: -8 }}>
          צפייה ופעולה במערכת בתור משתמש אחר. כל פעולה תבוצע כאילו אתה אותו משתמש - אפשר לחזור לעצמך בכל רגע.
        </p>
      </div>
      <div className="card">
        <ViewAsUserList users={users} />
      </div>
    </div>
  );
}
