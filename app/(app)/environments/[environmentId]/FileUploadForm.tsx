"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACCEPT_ATTRIBUTE, describeFileRules, validateFile } from "@/lib/storage/fileRules";
import { uploadViaTicket } from "@/lib/storage/clientUpload";
import UploadProgressBar from "@/components/UploadProgressBar";

const ROLE_LABELS: Record<string, string> = {
  template: "תבנית חוזה (Word)",
  guidelines: "הנחיות",
  reference: "חומר עזר",
  font: "פונט",
  exhibit: "נספח",
  other: "אחר",
};

export default function FileUploadForm({ environmentId }: { environmentId: string }) {
  const router = useRouter();
  const [fileRole, setFileRole] = useState("template");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);

    const clientError = validateFile(file.name, file.type, file.size);
    if (clientError) {
      setError(clientError);
      return;
    }

    try {
      setStatus("מכין העלאה...");
      const initRes = await fetch(`/api/environments/${environmentId}/files/init-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!initRes.ok) {
        const body = await initRes.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה בהכנת ההעלאה");
      }
      const { ticket } = await initRes.json();

      setStatus("מעלה...");
      setProgress(0);
      const uploaded = await uploadViaTicket(ticket, file, setProgress);

      setProgress(null);
      setStatus("מעבד...");
      const finalizeRes = await fetch(`/api/environments/${environmentId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: uploaded.path,
          drive_file_id: uploaded.driveFileId,
          file_role: fileRole,
          original_filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        }),
      });
      if (!finalizeRes.ok) {
        const body = await finalizeRes.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה בשמירת הקובץ");
      }

      setFile(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus(null);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="stack">
          <span>סוג קובץ</span>
          <select value={fileRole} onChange={(e) => setFileRole(e.target.value)}>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="stack">
          <span>קובץ</span>
          <input
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            onChange={(e) => {
              setError(null);
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </label>
        {progress !== null ? (
          <UploadProgressBar label="מעלה" percent={progress} />
        ) : (
          <button type="submit" disabled={!file || Boolean(status)}>
            {status ?? "העלאה"}
          </button>
        )}
      </div>
      <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "0.85rem" }}>{describeFileRules()}</p>
      {error && <span style={{ color: "var(--danger)" }}>{error}</span>}
    </form>
  );
}
