export type StorageProviderKind = "supabase" | "google_drive";

export interface StorageRef {
  provider: StorageProviderKind;
  path: string;
  driveFileId?: string;
}

export interface StorageUploadInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface UploadTicket {
  provider: StorageProviderKind;
  /** Supabase: the storage path the file will land at once uploaded. */
  bucket?: string;
  path?: string;
  token?: string;
  /** Google Drive: PUT the file bytes directly to this resumable-session URL. */
  uploadUrl?: string;
}

export interface StorageProvider {
  upload(orgId: string, scopeId: string, file: StorageUploadInput): Promise<StorageRef>;
  download(ref: StorageRef): Promise<Buffer>;
  getSignedUrl(ref: StorageRef, expiresInSec: number): Promise<string>;
  delete(ref: StorageRef): Promise<void>;
  /** For direct browser-to-storage uploads, bypassing the Next.js API body-size limit. */
  createUploadTicket(orgId: string, scopeId: string, filename: string, mimeType: string): Promise<UploadTicket>;
}
