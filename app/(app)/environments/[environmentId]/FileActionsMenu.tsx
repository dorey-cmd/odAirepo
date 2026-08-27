"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, Copy, ArrowRightLeft } from "lucide-react";

export default function FileActionsMenu({
  environmentId,
  fileId,
  siblingEnvironments,
}: {
  environmentId: string;
  fileId: string;
  siblingEnvironments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"copy" | "move" | null>(null);
  const [targetId, setTargetId] = useState(siblingEnvironments[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setMode(null);
    setError(null);
  }

  async function handleDelete() {
    if (!confirm("למחוק את הקובץ? הפעולה בלתי הפיכה.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/environments/${environmentId}/files/${fileId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "שגיאה במחיקה");
      router.refresh();
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer() {
    if (!targetId || !mode) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/environments/${environmentId}/files/${fileId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetEnvironmentId: targetId, mode }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "שגיאה בהעברה");
      router.refresh();
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="ghost"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="פעולות קובץ"
        style={{ padding: "0.3rem" }}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          className="card stack"
          style={{ position: "absolute", insetInlineEnd: 0, top: "115%", zIndex: 10, minWidth: 210, padding: "0.5rem", gap: "0.25rem" }}
        >
          {mode === null ? (
            <>
              <button
                className="ghost"
                style={{ justifyContent: "flex-start", gap: "0.5rem", color: "var(--danger)" }}
                onClick={handleDelete}
                disabled={busy}
              >
                <Trash2 size={14} /> מחיקה
              </button>
              {siblingEnvironments.length > 0 && (
                <>
                  <button
                    className="ghost"
                    style={{ justifyContent: "flex-start", gap: "0.5rem" }}
                    onClick={() => setMode("copy")}
                    disabled={busy}
                  >
                    <Copy size={14} /> העתקה לסביבה אחרת
                  </button>
                  <button
                    className="ghost"
                    style={{ justifyContent: "flex-start", gap: "0.5rem" }}
                    onClick={() => setMode("move")}
                    disabled={busy}
                  >
                    <ArrowRightLeft size={14} /> העברה לסביבה אחרת
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="stack" style={{ gap: "0.4rem" }}>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                {siblingEnvironments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button onClick={handleTransfer} disabled={busy}>
                  {mode === "copy" ? "העתק" : "העבר"}
                </button>
                <button className="secondary" onClick={() => setMode(null)} disabled={busy}>
                  ביטול
                </button>
              </div>
            </div>
          )}
          {error && <span style={{ color: "var(--danger)", fontSize: "0.78rem" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
