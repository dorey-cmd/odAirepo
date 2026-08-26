import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEnvironment, listEnvironmentFiles } from "@/lib/db/queries/environments";
import FileUploadForm from "./FileUploadForm";

export default async function EnvironmentDetailPage({
  params,
}: {
  params: Promise<{ environmentId: string }>;
}) {
  const { environmentId } = await params;
  const supabase = await createClient();
  const environment = await getEnvironment(supabase, environmentId);
  if (!environment) notFound();

  const files = await listEnvironmentFiles(supabase, environmentId);
  const webhookUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/contracts/${environment.id}`
      : `/api/webhooks/contracts/${environment.id}`;

  return (
    <div className="stack">
      <h1>{environment.name}</h1>
      {environment.description && <p style={{ color: "var(--text-muted)" }}>{environment.description}</p>}

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>קליטת חוזה חדש (Webhook)</h2>
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          כל מערכת חיצונית יכולה לשלוח POST לכתובת זו עם פרטי החוזה החדש, כולל
          Authorization: Bearer &lt;token&gt;.
        </p>
        <code style={{ userSelect: "all" }}>{webhookUrl}</code>
        <code style={{ userSelect: "all" }}>Authorization: Bearer {environment.webhook_token}</code>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>קבצי הסביבה</h2>
        <FileUploadForm environmentId={environment.id} />
        {files.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>עדיין לא הועלו קבצים.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "right", color: "var(--text-muted)" }}>
                <th>קובץ</th>
                <th>סוג</th>
                <th>גודל</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem 0" }}>{f.original_filename}</td>
                  <td>{f.file_role}</td>
                  <td>{f.size_bytes ? `${Math.round(f.size_bytes / 1024)} KB` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
