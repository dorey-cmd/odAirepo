import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listContracts } from "@/lib/db/queries/contracts";

const STATUS_LABELS: Record<string, string> = {
  intake: "בקליטה",
  awaiting_info: "ממתין לפרטים",
  drafting: "בניסוח",
  draft_ready: "טיוטה מוכנה",
  revising: "בעדכון",
  finalized: "סופי",
  archived: "בארכיון",
  error: "שגיאה",
};

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
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{c.title ?? c.id}</strong>
              <span style={{ color: "var(--text-muted)" }}>{STATUS_LABELS[c.status] ?? c.status}</span>
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
