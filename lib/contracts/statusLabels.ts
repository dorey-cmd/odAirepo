import type { ContractStatus } from "@/types/contract";

export const STATUS_LABELS: Record<ContractStatus, string> = {
  intake: "בקליטה",
  awaiting_info: "ממתין לפרטים",
  drafting: "בניסוח",
  draft_ready: "טיוטה מוכנה",
  revising: "בעדכון",
  finalized: "סופי",
  archived: "בארכיון",
  error: "שגיאה",
};

/** Statuses that can still change on their own (webhook/AI processing) without the lawyer taking an action. */
export const NON_TERMINAL_STATUSES: ContractStatus[] = ["intake", "awaiting_info", "drafting", "revising"];

export function statusVariant(status: ContractStatus): "success" | "progress" | "danger" | "neutral" {
  if (status === "draft_ready" || status === "finalized") return "success";
  if (status === "error") return "danger";
  if (NON_TERMINAL_STATUSES.includes(status)) return "progress";
  return "neutral";
}
