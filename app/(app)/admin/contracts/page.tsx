import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/db/queries/admin";
import AdminContractsTable from "./AdminContractsTable";

export default async function AdminContractsPage() {
  const supabase = await createClient();
  if (!(await isPlatformAdmin(supabase))) notFound();

  const admin = createAdminClient();

  const [{ data: contracts }, { data: orgs }, { data: environments }] = await Promise.all([
    admin.from("contracts").select("id, title, status, updated_at, org_id, environment_id"),
    admin.from("orgs").select("id, name"),
    admin.from("contract_environments").select("id, name"),
  ]);

  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const envNameById = new Map((environments ?? []).map((e) => [e.id, e.name]));

  const rows = (contracts ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    updated_at: c.updated_at,
    orgName: orgNameById.get(c.org_id) ?? c.org_id,
    environmentName: envNameById.get(c.environment_id) ?? "-",
  }));

  return (
    <div className="stack">
      <div>
        <Link href="/admin" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          ← חזרה לניהול מערכת
        </Link>
        <h1 style={{ marginTop: "0.25rem" }}>כל החוזים ({rows.length})</h1>
        <p style={{ color: "var(--text-muted)", marginTop: -8 }}>מכל הארגונים במערכת.</p>
      </div>

      <div className="card">
        <AdminContractsTable rows={rows} />
      </div>
    </div>
  );
}
