export type StorageProviderKind = "supabase" | "google_drive";

export interface ContractEnvironment {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  storage_provider: StorageProviderKind;
  google_drive_root_folder_id: string | null;
  webhook_token: string;
  status: "active" | "archived";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EnvironmentFileRole =
  | "template"
  | "guidelines"
  | "reference"
  | "font"
  | "exhibit"
  | "other";

export interface EnvironmentFile {
  id: string;
  environment_id: string;
  org_id: string;
  file_role: EnvironmentFileRole;
  storage_provider: StorageProviderKind;
  storage_path: string | null;
  google_drive_file_id: string | null;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  extracted_text: string | null;
  extracted_style_catalog: unknown | null;
  uploaded_by: string | null;
  created_at: string;
}
