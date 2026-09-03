import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/db/queries/admin";
import { estimateCostUsd } from "@/lib/ai/pricing";
import ContractStatusBadge from "@/components/ContractStatusBadge";

export default async function AdminOrgDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  if (!(await isPlatformAdmin(supabase))) notFound();

  const admin = createAdminClient();

  const [{ data: org }, { data: environments }, { data: contracts }, { data: usage }, { data: members }] =
    await Promise.all([
      admin.from("orgs").select("id, name, created_at").eq("id", orgId).maybeSingle(),
      admin.from("contract_environments").select("id, name, status, created_at").eq("org_id", orgId),
      admin
        .from("contracts")
        .select("id, title, status, updated_at, environment_id")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false }),
      admin
        .from("ai_usage_log")
        .select("model, purpose, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_5m_tokens, cache_creation_1h_tokens")
        .eq("org_id", orgId),
      admin.from("org_members").select("user_id, role, created_at").eq("org_id", orgId),
    ]);

  if (!org) notFound();

  const memberEmails = new Map(
    await Promise.all(
      (members ?? []).map(async (m) => {
        const { data } = await admin.auth.admin.getUserById(m.user_id);
        return [m.user_id, data.user?.email ?? m.user_id] as const;
      }),
    ),
  );

  const totalInput = (usage ?? []).reduce((sum, u) => sum + u.input_tokens, 0);
  const totalOutput = (usage ?? []).reduce((sum, u) => sum + u.output_tokens, 0);
  const totalCost = (usage ?? []).reduce(
    (sum, u) =>
      sum +
      estimateCostUsd(u.model, u.input_tokens, u.output_tokens, {
        creation5mTokens: u.cache_creation_5m_tokens,
        creation1hTokens: u.cache_creation_1h_tokens,
        readTokens: u.cache_read_input_tokens,
      }),
    0,
  );

  const envNameById = new Map((environments ?? []).map((e) => [e.id, e.name]));

  return (
    <div className="stack">
      <div>
        <Link href="/admin" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          ← חזרה לניהול מערכת
        </Link>
        <h1 style={{ marginTop: "0.25rem" }}>{org.name}</h1>
        <p style={{ color: "var(--text-muted)", marginTop: -8 }}>
          נוצר ב-{new Date(org.created_at).toLocaleDateString("he-IL")}
        </p>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>שימוש ב-AI</h2>
        <p style={{ margin: 0 }}>
          {totalInput.toLocaleString()} input tokens · {totalOutput.toLocaleString()} output tokens · עלות משוערת ${totalCost.toFixed(2)}
        </p>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>חברי ארגון ({(members ?? []).length})</h2>
        {(members ?? []).length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>אין חברים.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>משתמש</th>
                <th>תפקיד</th>
                <th>הצטרף</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.user_id}>
                  <td>{memberEmails.get(m.user_id) ?? m.user_id}</td>
                  <td>{m.role}</td>
                  <td>{new Date(m.created_at).toLocaleDateString("he-IL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>סביבות חוזה ({(environments ?? []).length})</h2>
        {(environments ?? []).length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>אין סביבות.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>שם</th>
                <th>סטטוס</th>
                <th>נוצר</th>
              </tr>
            </thead>
            <tbody>
              {(environments ?? []).map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>{e.status}</td>
                  <td>{new Date(e.created_at).toLocaleDateString("he-IL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>חוזים ({(contracts ?? []).length})</h2>
        {(contracts ?? []).length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>אין חוזים.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>כותרת</th>
                <th>סביבה</th>
                <th>סטטוס</th>
                <th>עודכן</th>
              </tr>
            </thead>
            <tbody>
              {(contracts ?? []).map((c) => (
                <tr key={c.id}>
                  <td>{c.title ?? c.id}</td>
                  <td>{envNameById.get(c.environment_id) ?? "-"}</td>
                  <td>
                    <ContractStatusBadge contractId={c.id} initialStatus={c.status} />
                  </td>
                  <td>{new Date(c.updated_at).toLocaleString("he-IL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
