import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listEnvironments } from "@/lib/db/queries/environments";
import { listContracts } from "@/lib/db/queries/contracts";
import ContractStatusBadge from "@/components/ContractStatusBadge";

/** Statuses worth a lawyer's attention right now: something broke, a draft is ready to review, or it's their turn to reply. */
const NEEDS_ATTENTION = new Set(["error", "draft_ready", "awaiting_info"]);

export default async function DashboardPage() {
  const supabase = await createClient();
  const [environments, contracts] = await Promise.all([listEnvironments(supabase), listContracts(supabase)]);

  const needsAttention = contracts
    .filter((c) => NEEDS_ATTENTION.has(c.status))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10);

  return (
    <div className="stack">
      <h1>לוח בקרה</h1>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>
          דורש תשומת לב {needsAttention.length > 0 && `(${needsAttention.length})`}
        </h2>
        {needsAttention.length === 0 ? (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>אין כרגע חוזים שדורשים תשומת לב.</p>
        ) : (
          <div className="stack" style={{ gap: "0.5rem" }}>
            {needsAttention.map((c) => (
              <Link
                key={c.id}
                href={`/contracts/${c.id}`}
                className="card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem" }}
              >
                <div>
                  <strong>{c.title ?? c.id}</strong>
                  <p style={{ color: "var(--text-muted)", margin: "0.15rem 0 0", fontSize: "0.85rem" }}>
                    {c.contract_environments?.name}
                  </p>
                </div>
                <ContractStatusBadge contractId={c.id} initialStatus={c.status} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <p style={{ marginTop: 0 }}>יש לך {environments.length} סביבות חוזה פעילות.</p>
        <Link href="/environments">לניהול סביבות החוזה →</Link>
      </div>
    </div>
  );
}
