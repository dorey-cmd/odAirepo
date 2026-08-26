"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewEnvironmentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [storageProvider, setStorageProvider] = useState<"supabase" | "google_drive">("supabase");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, storage_provider: storageProvider }),
    });
    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "שגיאה לא צפויה");
      return;
    }
    router.push(`/environments/${body.environment.id}`);
  }

  return (
    <div className="stack" style={{ maxWidth: 480 }}>
      <h1>סביבת חוזה חדשה</h1>
      <form onSubmit={handleSubmit} className="card stack">
        <label className="stack">
          <span>שם הסביבה</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="stack">
          <span>תיאור (אופציונלי)</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="stack">
          <span>היכן לשמור את קבצי הסביבה?</span>
          <select value={storageProvider} onChange={(e) => setStorageProvider(e.target.value as "supabase" | "google_drive")}>
            <option value="supabase">אחסון פנימי (ברירת מחדל)</option>
            <option value="google_drive">Google Drive שלי</option>
          </select>
          {storageProvider === "google_drive" && (
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              צריך לחבר Google Drive תחת &quot;Google Drive&quot; בתפריט לפני שמעלים קבצים.
            </span>
          )}
        </label>
        {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
        <button type="submit" disabled={loading}>
          יצירה
        </button>
      </form>
    </div>
  );
}
