import { notFound } from "next/navigation";
import { FileText, FileImage, FileVideo, FileAudio, FileType, File as FileIcon, Webhook, FolderOpen, Files } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getEnvironment, listEnvironmentFiles, listEnvironments } from "@/lib/db/queries/environments";
import { listContractsByEnvironment } from "@/lib/db/queries/contracts";
import FileUploadForm from "./FileUploadForm";
import NewContractFromFileForm from "./NewContractFromFileForm";
import FileActionsMenu from "./FileActionsMenu";
import EnvironmentContractsTable from "./EnvironmentContractsTable";

const ROLE_LABELS: Record<string, string> = {
  template: "תבנית חוזה",
  guidelines: "הנחיות",
  reference: "חומר עזר",
  font: "פונט",
  exhibit: "נספח",
  other: "אחר",
};

function fileIconFor(mimeType: string | null) {
  if (!mimeType) return FileIcon;
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.startsWith("audio/")) return FileAudio;
  if (mimeType.startsWith("font/") || mimeType.includes("font")) return FileType;
  if (mimeType === "application/pdf" || mimeType.includes("word")) return FileText;
  return FileIcon;
}

export default async function EnvironmentDetailPage({
  params,
}: {
  params: Promise<{ environmentId: string }>;
}) {
  const { environmentId } = await params;
  const supabase = await createClient();
  const environment = await getEnvironment(supabase, environmentId);
  if (!environment) notFound();

  const [files, contracts, allEnvironments] = await Promise.all([
    listEnvironmentFiles(supabase, environmentId),
    listContractsByEnvironment(supabase, environmentId),
    listEnvironments(supabase),
  ]);
  const siblingEnvironments = allEnvironments
    .filter((e) => e.id !== environmentId)
    .map((e) => ({ id: e.id, name: e.name }));

  const webhookUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/contracts/${environment.id}`
      : `/api/webhooks/contracts/${environment.id}`;

  return (
    <div className="stack" style={{ gap: "1.75rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.9rem", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{environment.name}</h1>
        {environment.description && (
          <span style={{ color: "var(--text-muted)" }}>{environment.description}</span>
        )}
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <FileText size={20} color="var(--gold-ink)" /> קבצי הסביבה
        </h2>
        <FileUploadForm environmentId={environment.id} />
        {files.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>עדיין לא הועלו קבצים.</p>
        ) : (
          <div className="stack">
            {files.map((f) => {
              const fileUrl = `/api/environments/${environment.id}/files/${f.id}`;
              const isImage = f.mime_type?.startsWith("image/");
              const isVideo = f.mime_type?.startsWith("video/");
              const isAudio = f.mime_type?.startsWith("audio/");
              const Icon = fileIconFor(f.mime_type);
              return (
                <div key={f.id} className="card stack" style={{ padding: "0.75rem 1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                    <a href={fileUrl} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Icon size={16} color="var(--text-muted)" />
                      {f.original_filename}
                    </a>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span className="badge">{ROLE_LABELS[f.file_role] ?? f.file_role}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        {f.size_bytes ? `${Math.round(f.size_bytes / 1024)} KB` : "-"}
                      </span>
                      <FileActionsMenu environmentId={environment.id} fileId={f.id} siblingEnvironments={siblingEnvironments} />
                    </div>
                  </div>
                  {isImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl} alt={f.original_filename} style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8 }} />
                  )}
                  {isVideo && (
                    <video src={fileUrl} controls style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8 }} />
                  )}
                  {isAudio && <audio src={fileUrl} controls style={{ width: "100%" }} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <FolderOpen size={20} color="var(--gold-ink)" /> התחלת חוזה חדש מקובץ
        </h2>
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          מעלים PDF או Word עם פרטי החוזה - אפשר גם לגרור את הקובץ לאזור למטה.
        </p>
        <NewContractFromFileForm environmentId={environment.id} />
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Files size={20} color="var(--gold-ink)" /> חוזים בסביבה זו ({contracts.length})
        </h2>
        {contracts.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>עדיין אין חוזים בסביבה הזו.</p>
        ) : (
          <EnvironmentContractsTable contracts={contracts} />
        )}
      </div>

      <details className="card">
        <summary style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 600 }}>
          <Webhook size={18} color="var(--gold-ink)" /> קליטת חוזה חדש דרך Webhook
        </summary>
        <div className="stack" style={{ marginTop: "0.9rem" }}>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>
            כל מערכת חיצונית יכולה לשלוח POST לכתובת זו עם פרטי החוזה החדש, כולל Authorization: Bearer &lt;token&gt;.
          </p>
          <code style={{ userSelect: "all", wordBreak: "break-all" }}>{webhookUrl}</code>
          <code style={{ userSelect: "all", wordBreak: "break-all" }}>Authorization: Bearer {environment.webhook_token}</code>
        </div>
      </details>
    </div>
  );
}
