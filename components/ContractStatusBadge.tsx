"use client";

import { useEffect, useState } from "react";
import type { ContractStatus } from "@/types/contract";
import { NON_TERMINAL_STATUSES, STATUS_LABELS, statusVariant } from "@/lib/contracts/statusLabels";

const POLL_MS = 4000;

export default function ContractStatusBadge({
  contractId,
  initialStatus,
}: {
  contractId: string;
  initialStatus: ContractStatus;
}) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    if (!NON_TERMINAL_STATUSES.includes(status)) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/contracts/${contractId}/status`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setStatus(data.status);
      } catch {
        // transient network hiccup - next tick retries, nothing to show the lawyer
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [contractId, status]);

  const variant = statusVariant(status);
  const isLive = NON_TERMINAL_STATUSES.includes(status);

  return (
    <span className={`badge${variant !== "neutral" ? ` badge-${variant}` : ""}`}>
      {isLive && <span className="badge-dot" style={{ animation: "badge-pulse 1.4s ease-in-out infinite" }} />}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
