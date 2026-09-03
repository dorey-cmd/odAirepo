import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/db/queries/admin";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { STATUS_LABELS, NON_TERMINAL_STATUSES } from "@/lib/contracts/statusLabels";
import type { ContractStatus } from "@/types/contract";
import AdminOrgsTable from "./AdminOrgsTable";

const STUCK_THRESHOLD_HOURS = 2;

export default async function AdminPage() {
  const supabase = await createClient();
  if (!(await isPlatformAdmin(supabase))) notFound();

  const admin = createAdminClient();

  const [{ data: orgs }, { data: environments }, { data: contracts }, { data: usage }, { data: errors }] =
    await Promise.all([
      admin.from("orgs").select("id, name, created_at").order("created_at", { ascending: false }),
      admin.from("contract_environments").select("id, org_id"),
      admin.from("contracts").select("id, org_id, title, status, updated_at"),
      admin
        .from("ai_usage_log")
        .select(
          "org_id, purpose, model, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_5m_tokens, cache_creation_1h_tokens",
        ),
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

  const usageByOrg = new Map<string, { input: number; output: number; cost: number }>();
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  for (const u of usage ?? []) {
    const cost = estimateCostUsd(u.model, u.input_tokens, u.output_tokens, {
      creation5mTokens: u.cache_creation_5m_tokens,
      creation1hTokens: u.cache_creation_1h_tokens,
      readTokens: u.cache_read_input_tokens,
    });
    const cur = usageByOrg.get(u.org_id) ?? { input: 0, output: 0, cost: 0 };
    cur.input += u.input_tokens;
    cur.output += u.output_tokens;
    cur.cost += cost;
    usageByOrg.set(u.org_id, cur);
    totalInput += u.input_tokens;
    totalOutput += u.output_tokens;
    totalCost += cost;
  }

  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  const stuckThresholdMs = Date.now() - STUCK_THRESHOLD_HOURS * 60 * 60 * 1000;
  const stuckContracts = (contracts ?? [])
    .filter((c) => NON_TERMINAL_STATUSES.includes(c.status) && new Date(c.updated_at).getTime() < stuckThresholdMs)
    .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());

  const orgRows = (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    createdAt: new Date(o.created_at).toLocaleDateString("he-IL"),
    envCount: envCountByOrg.get(o.id) ?? 0,
    contractCount: contractCountByOrg.get(o.id) ?? 0,
    inputTokens: usageByOrg.get(o.id)?.input ?? 0,
    outputTokens: usageByOrg.get(o.id)?.output ?? 0,
    estCostUsd: usageByOrg.get(o.id)?.cost ?? 0,
  }));

  return (
    <div className="stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem" }}>
        <h1>ניהול מערכת</h1>
        <div style={{ display: "flex", gap: "1rem" }}>
          <Link href="/admin/view-as">View As ←</Link>
          <Link href="/admin/contracts">כל החוזים בכל הארגונים ←</Link>
        </div>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>שימוש ב-AI (סה&quot;כ)</h2>
        <p style={{ margin: 0 }}>
          {totalInput.toLocaleString()} input tokens · {totalOutput.toLocaleString()} output tokens ·{" "}
          {(usage ?? []).length} קריאות · עלות משוערת ${totalCost.toFixed(2)}
        </p>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
          העלות מבוססת על תעריפי Claude הנוכחיים - הערכה בלבד, לא חשבונית.
        </p>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>
          חוזים תקועים (מעל {STUCK_THRESHOLD_HOURS} שעות) {stuckContracts.length > 0 && `(${stuckContracts.length})`}
        </h2>
        {stuckContracts.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>אין חוזים תקועים כרגע.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ארגון</th>
                <th>כותרת</th>
                <th>סטטוס</th>
                <th>עודכן לאחרונה</th>
              </tr>
            </thead>
            <tbody>
              {stuckContracts.map((c) => (
                <tr key={c.id}>
                  <td>{orgNameById.get(c.org_id) ?? c.org_id}</td>
                  <td>
                    <Link href={`/contracts/${c.id}`}>{c.title ?? c.id}</Link>
                  </td>
                  <td>
                    <span className="badge badge-danger">{STATUS_LABELS[c.status as ContractStatus] ?? c.status}</span>
                  </td>
                  <td>{new Date(c.updated_at).toLocaleString("he-IL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>ארגונים ({(orgs ?? []).length})</h2>
        <AdminOrgsTable rows={orgRows} />
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>שגיאות webhook אחרונות</h2>
        {(errors ?? []).length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>אין שגיאות פתוחות.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ארגון</th>
                <th>שגיאה</th>
                <th>מתי</th>
              </tr>
            </thead>
            <tbody>
              {(errors ?? []).map((e) => (
                <tr key={e.id}>
                  <td>{orgNameById.get(e.org_id) ?? e.org_id}</td>
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
