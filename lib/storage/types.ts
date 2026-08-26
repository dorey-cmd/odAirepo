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

export interface StorageProvider {
  upload(orgId: string, scopeId: string, file: StorageUploadInput): Promise<StorageRef>;
  download(ref: StorageRef): Promise<Buffer>;
  getSignedUrl(ref: StorageRef, expiresInSec: number): Promise<string>;
  delete(ref: StorageRef): Promise<void>;
}
