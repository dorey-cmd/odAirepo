import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listContracts } from "@/lib/db/queries/contracts";
import ContractStatusBadge from "@/components/ContractStatusBadge";
import ContractActionsMenu from "@/components/ContractActionsMenu";

export default async function ContractsPage() {
  const supabase = await createClient();
  const contracts = await listContracts(supabase);

  return (
    <div className="stack">
      <h1>חוזים</h1>
      {contracts.length === 0 && (
        <div className="card">
          <p>עדיין אין חוזים. שלח/י webhook לסביבת חוזה כדי להתחיל אחד.</p>
        </div>
      )}
      <div className="stack">
        {contracts.map((c) => (
          <Link key={c.id} href={`/contracts/${c.id}`} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{c.title ?? c.id}</strong>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ContractStatusBadge contractId={c.id} initialStatus={c.status} />
                <ContractActionsMenu contractId={c.id} isArchived={c.status === "archived"} />
              </div>
            </div>
            <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0" }}>
              {c.contract_environments?.name}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
