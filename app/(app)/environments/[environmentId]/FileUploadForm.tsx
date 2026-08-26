"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setLoading(true);

    const form = new FormData();
    form.append("file", file);
    form.append("file_role", fileRole);

    const res = await fetch(`/api/environments/${environmentId}/files`, {
      method: "POST",
      body: form,
    });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "שגיאה לא צפויה בהעלאה");
      return;
    }
    setFile(null);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ flexDirection: "row", alignItems: "flex-end" }}>
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
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <button type="submit" disabled={!file || loading}>
        {loading ? "מעלה..." : "העלאה"}
      </button>
      {error && <span style={{ color: "var(--danger)" }}>{error}</span>}
    </form>
  );
}
