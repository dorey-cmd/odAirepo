"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, Archive, ArchiveRestore } from "lucide-react";

export default function ContractActionsMenu({
  contractId,
  isArchived,
  redirectTo,
}: {
  contractId: string;
  isArchived: boolean;
  /** Where to navigate after a successful delete - e.g. back to the list when this menu is on the contract's own detail page. Omit to just refresh in place (list/table rows). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
  }

  async function handleArchiveToggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: isArchived ? "awaiting_info" : "archived" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "שגיאה בעדכון");
      router.refresh();
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("למחוק את החוזה לצמיתות? כל הצ'אט, הטיוטות והקבצים יימחקו. הפעולה בלתי הפיכה.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${contractId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "שגיאה במחיקה");
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open ? close() : setOpen(true);
        }}
        aria-label="פעולות חוזה"
        style={{ padding: "0.3rem" }}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          className="card stack"
          style={{ position: "absolute", insetInlineEnd: 0, top: "115%", zIndex: 10, minWidth: 180, padding: "0.5rem", gap: "0.25rem" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="ghost"
            style={{ justifyContent: "flex-start", gap: "0.5rem" }}
            onClick={handleArchiveToggle}
            disabled={busy}
          >
            {isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {isArchived ? "ביטול ארכוב" : "העברה לארכיון"}
          </button>
          <button
            className="ghost"
            style={{ justifyContent: "flex-start", gap: "0.5rem", color: "var(--danger)" }}
            onClick={handleDelete}
            disabled={busy}
          >
            <Trash2 size={14} /> מחיקה לצמיתות
          </button>
          {error && <span style={{ color: "var(--danger)", fontSize: "0.78rem" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
