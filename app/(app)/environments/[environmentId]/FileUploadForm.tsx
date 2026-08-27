"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACCEPT_ATTRIBUTE, describeFileRules, validateFile } from "@/lib/storage/fileRules";
import { uploadViaTicket } from "@/lib/storage/clientUpload";
import UploadProgressBar from "@/components/UploadProgressBar";
import DropZone from "@/components/DropZone";

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
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function uploadFile(file: File) {
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

      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus(null);
      setProgress(null);
    }
  }

  const busy = Boolean(status);

  return (
    <div className="stack">
      <label className="stack" style={{ maxWidth: 260 }}>
        <span>סוג קובץ</span>
        <select value={fileRole} onChange={(e) => setFileRole(e.target.value)} disabled={busy}>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {progress !== null ? (
        <UploadProgressBar label="מעלה" percent={progress} />
      ) : (
        <DropZone
          onFile={uploadFile}
          accept={ACCEPT_ATTRIBUTE}
          disabled={busy}
          label={busy ? (status ?? "") : "גרור/י קובץ לכאן, או לחצ/י לבחירה"}
          hint={describeFileRules()}
        />
      )}
      {error && <span style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
