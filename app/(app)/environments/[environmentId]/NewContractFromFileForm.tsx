"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { INTAKE_ACCEPT_ATTRIBUTE, describeIntakeFileRules, validateIntakeFile } from "@/lib/storage/fileRules";
import { uploadViaTicket } from "@/lib/storage/clientUpload";
import UploadProgressBar from "@/components/UploadProgressBar";
import DropZone from "@/components/DropZone";

export default function NewContractFromFileForm({ environmentId }: { environmentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function uploadFile(file: File) {
    setError(null);

    const clientError = validateIntakeFile(file.name, file.type, file.size);
    if (clientError) {
      setError(clientError);
      return;
    }

    const thinkingTimer = setTimeout(() => setStatus("מזהה פרטי חוזה..."), 5000);
    const draftingTimer = setTimeout(() => setStatus("מכין טיוטה, זה עשוי לקחת עד דקה..."), 20000);

    try {
      setStatus("מעלה...");
      const initRes = await fetch(`/api/environments/${environmentId}/contracts/init-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!initRes.ok) {
        const body = await initRes.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה בהכנת ההעלאה");
      }
      const { ticket } = await initRes.json();

      setProgress(0);
      const uploaded = await uploadViaTicket(ticket, file, setProgress);
      setProgress(null);

      setStatus("מעבד...");
      const createRes = await fetch(`/api/environments/${environmentId}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: uploaded.path,
          drive_file_id: uploaded.driveFileId,
          original_filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        }),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה ביצירת החוזה");
      }
      const { contractId } = await createRes.json();
      router.push(`/contracts/${contractId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      clearTimeout(thinkingTimer);
      clearTimeout(draftingTimer);
      setStatus(null);
      setProgress(null);
    }
  }

  const busy = Boolean(status);

  return (
    <div className="stack">
      {progress !== null ? (
        <UploadProgressBar label="מעלה" percent={progress} />
      ) : (
        <DropZone
          onFile={uploadFile}
          accept={INTAKE_ACCEPT_ATTRIBUTE}
          disabled={busy}
          label={busy ? (status ?? "") : "גרור/י מסמך עם פרטי החוזה לכאן, או לחצ/י לבחירה"}
          hint={describeIntakeFileRules()}
        />
      )}
      {error && <span style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
