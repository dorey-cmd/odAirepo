import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/db/queries/admin";

export default async function AdminPage() {
  const supabase = await createClient();
  if (!(await isPlatformAdmin(supabase))) notFound();

  const admin = createAdminClient();

  const [{ data: orgs }, { data: environments }, { data: contracts }, { data: usage }, { data: errors }] =
    await Promise.all([
      admin.from("orgs").select("id, name, created_at").order("created_at", { ascending: false }),
      admin.from("contract_environments").select("id, org_id"),
      admin.from("contracts").select("id, org_id, status"),
      admin.from("ai_usage_log").select("org_id, purpose, model, input_tokens, output_tokens"),
      admin
        .from("webhook_intake_events")
        .select("id, org_id, environment_id, error_message, created_at")
        .eq("processing_status", "error")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const envCountByOrg = new Map<string, number>();
  for (const e of environments ?? []) envCountByOrg.set(e.org_id, (envCountByOrg.get(e.org_id) ?? 0) + 1);

  const contractCountByOrg = new Map<string, number>();
  for (const c of contracts ?? []) contractCountByOrg.set(c.org_id, (contractCountByOrg.get(c.org_id) ?? 0) + 1);

  const usageByOrg = new Map<string, { input: number; output: number }>();
  let totalInput = 0;
  let totalOutput = 0;
  for (const u of usage ?? []) {
    const cur = usageByOrg.get(u.org_id) ?? { input: 0, output: 0 };
    cur.input += u.input_tokens;
    cur.output += u.output_tokens;
    usageByOrg.set(u.org_id, cur);
    totalInput += u.input_tokens;
    totalOutput += u.output_tokens;
  }

  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return (
    <div className="stack">
      <h1>ניהול מערכת</h1>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>שימוש ב-AI (סה"כ)</h2>
        <p style={{ margin: 0 }}>
          {totalInput.toLocaleString()} input tokens · {totalOutput.toLocaleString()} output tokens ·{" "}
          {(usage ?? []).length} קריאות
        </p>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>ארגונים ({(orgs ?? []).length})</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", color: "var(--text-muted)" }}>
              <th>שם</th>
              <th>נוצר</th>
              <th>סביבות</th>
              <th>חוזים</th>
              <th>Input tokens</th>
              <th>Output tokens</th>
            </tr>
          </thead>
          <tbody>
            {(orgs ?? []).map((o) => (
              <tr key={o.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "0.4rem 0" }}>{o.name}</td>
                <td>{new Date(o.created_at).toLocaleDateString("he-IL")}</td>
                <td>{envCountByOrg.get(o.id) ?? 0}</td>
                <td>{contractCountByOrg.get(o.id) ?? 0}</td>
                <td>{(usageByOrg.get(o.id)?.input ?? 0).toLocaleString()}</td>
                <td>{(usageByOrg.get(o.id)?.output ?? 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>שגיאות webhook אחרונות</h2>
        {(errors ?? []).length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>אין שגיאות פתוחות.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "right", color: "var(--text-muted)" }}>
                <th>ארגון</th>
                <th>שגיאה</th>
                <th>מתי</th>
              </tr>
            </thead>
            <tbody>
              {(errors ?? []).map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem 0" }}>{orgNameById.get(e.org_id) ?? e.org_id}</td>
                  <td style={{ color: "var(--danger)" }}>{e.error_message}</td>
                  <td>{new Date(e.created_at).toLocaleString("he-IL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
