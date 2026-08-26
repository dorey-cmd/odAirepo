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
  bucket: string;
  path: string;
  token: string;
}

export interface StorageProvider {
  upload(orgId: string, scopeId: string, file: StorageUploadInput): Promise<StorageRef>;
  download(ref: StorageRef): Promise<Buffer>;
  getSignedUrl(ref: StorageRef, expiresInSec: number): Promise<string>;
  delete(ref: StorageRef): Promise<void>;
  /** For direct browser-to-storage uploads, bypassing the Next.js API body-size limit. */
  createUploadTicket(orgId: string, scopeId: string, filename: string): Promise<UploadTicket>;
}
