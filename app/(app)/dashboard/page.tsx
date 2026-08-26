import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listEnvironments } from "@/lib/db/queries/environments";

export default async function DashboardPage() {
  const supabase = await createClient();
  const environments = await listEnvironments(supabase);

  return (
    <div className="stack">
      <h1>לוח בקרה</h1>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          יש לך {environments.length} סביבות חוזה פעילות.
        </p>
        <Link href="/environments">לניהול סביבות החוזה →</Link>
      </div>
    </div>
  );
}
