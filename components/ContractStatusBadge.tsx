"use client";

import { useEffect, useRef, useState } from "react";
import type { ContractStatus } from "@/types/contract";
import { LIVE_PROCESSING_STATUSES, NON_TERMINAL_STATUSES, STATUS_LABELS, statusVariant } from "@/lib/contracts/statusLabels";

const POLL_MS = 4000;
// Even a "terminal" status (draft_ready, awaiting_info, ...) can go stale: a
// new message sent from another tab/session can flip it to "revising"
// without this component ever knowing, since that decision used to only get
// made once at mount based on the initial status - a badge that loaded while
// "draft_ready" would then never poll again, silently hiding an actually
// stuck turn indefinitely. Polling slowly even at rest keeps it truthful.
const IDLE_POLL_MS = 30000;

export default function ContractStatusBadge({
  contractId,
  initialStatus,
}: {
  contractId: string;
  initialStatus: ContractStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const res = await fetch(`/api/contracts/${contractId}/status`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setStatus(data.status);
          statusRef.current = data.status;
        }
      } catch {
        // transient network hiccup - next tick retries, nothing to show the lawyer
      }
      if (!cancelled) {
        timeoutId = setTimeout(tick, NON_TERMINAL_STATUSES.includes(statusRef.current) ? POLL_MS : IDLE_POLL_MS);
      }
    }

    timeoutId = setTimeout(tick, NON_TERMINAL_STATUSES.includes(statusRef.current) ? POLL_MS : IDLE_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [contractId]);

  const variant = statusVariant(status);
  const isLive = LIVE_PROCESSING_STATUSES.includes(status);
  const isError = status === "error";

  async function toggleDetails(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (detailsOpen) {
      setDetailsOpen(false);
      return;
    }
    setDetailsOpen(true);
    if (detail === null && !detailLoading) {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/contracts/${contractId}/chat`);
        const data = await res.json();
        const lastAssistant = [...(data.messages ?? [])].reverse().find((m: { role: string }) => m.role === "assistant");
        setDetail(lastAssistant?.content ?? "לא נמצא הסבר שמור לשגיאה הזו.");
      } catch {
        setDetail("לא ניתן היה לטעון את פרטי השגיאה כרגע.");
      } finally {
        setDetailLoading(false);
      }
    }
  }

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span
        className={`badge${variant !== "neutral" ? ` badge-${variant}` : ""}`}
        onClick={isError ? toggleDetails : undefined}
        style={isError ? { cursor: "pointer" } : undefined}
        role={isError ? "button" : undefined}
        title={isError ? "לחצ/י לפרטים" : undefined}
      >
        {isLive && <span className="badge-dot" style={{ animation: "badge-pulse 1.4s ease-in-out infinite" }} />}
        {STATUS_LABELS[status] ?? status}
      </span>
      {isError && detailsOpen && (
        <div
          className="card"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            insetInlineEnd: 0,
            top: "130%",
            zIndex: 20,
            width: 320,
            maxWidth: "80vw",
            padding: "0.75rem",
            fontSize: "0.85rem",
            fontWeight: 400,
            whiteSpace: "normal",
            textAlign: "right",
          }}
        >
          {detailLoading ? "טוען..." : detail}
        </div>
      )}
    </span>
  );
}
