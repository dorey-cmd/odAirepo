import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listEnvironments } from "@/lib/db/queries/environments";

export default async function EnvironmentsPage() {
  const supabase = await createClient();
  const environments = await listEnvironments(supabase);

  return (
    <div className="stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>סביבות חוזה</h1>
        <Link href="/environments/new">
          <button>סביבת חוזה חדשה</button>
        </Link>
      </div>

      {environments.length === 0 && (
        <div className="card">
          <p>עדיין אין סביבות חוזה. צור/י את הראשונה כדי להתחיל.</p>
        </div>
      )}

      <div className="stack">
        {environments.map((env) => (
          <Link key={env.id} href={`/environments/${env.id}`} className="card">
            <strong>{env.name}</strong>
            {env.description && <p style={{ color: "var(--text-muted)" }}>{env.description}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
