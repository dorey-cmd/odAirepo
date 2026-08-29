import type { ContractStatus } from "@/types/contract";

export const STATUS_LABELS: Record<ContractStatus, string> = {
  intake: "בקליטה",
  awaiting_info: "ממתין לתגובתך",
  drafting: "ה-AI מנסח כעת",
  draft_ready: "טיוטה מוכנה",
  revising: "ה-AI מעדכן כעת",
  finalized: "סופי",
  archived: "בארכיון",
  error: "שגיאה",
};

/** Statuses that can still change on their own (webhook/AI processing) without the lawyer taking an action. */
export const NON_TERMINAL_STATUSES: ContractStatus[] = ["intake", "awaiting_info", "drafting", "revising"];

/** Subset of NON_TERMINAL_STATUSES where the AI is actually mid-call right now - these get the blinking dot. "awaiting_info" is the lawyer's turn, so it stays calm. */
export const LIVE_PROCESSING_STATUSES: ContractStatus[] = ["intake", "drafting", "revising"];

export function statusVariant(status: ContractStatus): "success" | "progress" | "danger" | "neutral" {
  if (status === "draft_ready" || status === "finalized") return "success";
  if (status === "error") return "danger";
  if (LIVE_PROCESSING_STATUSES.includes(status)) return "progress";
  return "neutral";
}
