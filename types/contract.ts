export type ContractStatus =
  | "intake"
  | "awaiting_info"
  | "drafting"
  | "draft_ready"
  | "revising"
  | "finalized"
  | "archived"
  | "error";

export interface Contract {
  id: string;
  environment_id: string;
  org_id: string;
  title: string | null;
  status: ContractStatus;
  intake_source: "webhook" | "manual_upload" | "manual_form" | null;
  extracted_fields: Record<string, unknown>;
  missing_fields: { field_key: string; reason: string }[];
  current_draft_version: number;
  created_at: string;
  updated_at: string;
}

export interface ContractChatMessage {
  id: string;
  chat_id: string;
  role: "lawyer" | "assistant" | "system";
  content: string | null;
  tool_call: Record<string, unknown> | null;
  attachment_file_ids: string[];
  created_at: string;
}

export interface ContractFile {
  id: string;
  contract_id: string;
  file_role: "intake_upload" | "draft_version" | "supporting_upload";
  storage_provider: "supabase" | "google_drive";
  storage_path: string | null;
  google_drive_file_id: string | null;
  original_filename: string | null;
  version: number | null;
  created_at: string;
}
