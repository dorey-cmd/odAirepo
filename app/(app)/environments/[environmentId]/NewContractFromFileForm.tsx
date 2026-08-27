"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { INTAKE_ACCEPT_ATTRIBUTE, describeIntakeFileRules, validateIntakeFile } from "@/lib/storage/fileRules";
import { uploadViaTicket } from "@/lib/storage/clientUpload";
import UploadProgressBar from "@/components/UploadProgressBar";

export default function NewContractFromFileForm({ environmentId }: { environmentId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
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

  return (
    <form onSubmit={handleSubmit} className="stack">
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="stack">
          <span>מסמך עם פרטי החוזה (PDF / Word)</span>
          <input
            type="file"
            accept={INTAKE_ACCEPT_ATTRIBUTE}
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
            {status ?? "התחל חוזה חדש"}
          </button>
        )}
      </div>
      <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "0.85rem" }}>{describeIntakeFileRules()}</p>
      {error && <span style={{ color: "var(--danger)" }}>{error}</span>}
    </form>
  );
}
