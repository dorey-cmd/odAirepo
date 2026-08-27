import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEnvironment, listEnvironmentFiles } from "@/lib/db/queries/environments";
import FileUploadForm from "./FileUploadForm";
import NewContractFromFileForm from "./NewContractFromFileForm";

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
        <h2 style={{ marginTop: 0 }}>או: התחלת חוזה חדש מקובץ</h2>
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          אפשר גם להתחיל חוזה חדש ישירות מכאן, בלי webhook - פשוט מעלים PDF או Word עם פרטי החוזה.
        </p>
        <NewContractFromFileForm environmentId={environment.id} />
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>קבצי הסביבה</h2>
        <FileUploadForm environmentId={environment.id} />
        {files.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>עדיין לא הועלו קבצים.</p>
        ) : (
          <div className="stack">
            {files.map((f) => {
              const fileUrl = `/api/environments/${environment.id}/files/${f.id}`;
              const isImage = f.mime_type?.startsWith("image/");
              const isVideo = f.mime_type?.startsWith("video/");
              return (
                <div key={f.id} className="card stack" style={{ padding: "0.75rem 1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <a href={fileUrl}>{f.original_filename}</a>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      {f.file_role} · {f.size_bytes ? `${Math.round(f.size_bytes / 1024)} KB` : "-"}
                    </span>
                  </div>
                  {isImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl} alt={f.original_filename} style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8 }} />
                  )}
                  {isVideo && (
                    <video src={fileUrl} controls style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8 }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
