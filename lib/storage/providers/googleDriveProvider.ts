import type { StorageProvider, StorageRef, StorageUploadInput, UploadTicket } from "@/lib/storage/types";

/**
 * Phase D (not yet implemented): backs a Contract Environment with the
 * lawyer's own Google Drive instead of Supabase Storage. See the plan's
 * "Storage Abstraction" and "Known Open Risks" sections — connect flow uses
 * Google Drive Picker to select/create one root folder per org
 * (drive.file scope), with one subfolder per environment auto-created
 * beneath it.
 */
export class GoogleDriveStorageProvider implements StorageProvider {
  constructor(private readonly orgId: string) {}

  async upload(_orgId: string, _scopeId: string, _file: StorageUploadInput): Promise<StorageRef> {
    throw new Error(`Google Drive storage backend not implemented yet (org ${this.orgId})`);
  }

  async download(_ref: StorageRef): Promise<Buffer> {
    throw new Error("Google Drive storage backend not implemented yet");
  }

  async getSignedUrl(_ref: StorageRef, _expiresInSec: number): Promise<string> {
    throw new Error("Google Drive storage backend not implemented yet");
  }

  async delete(_ref: StorageRef): Promise<void> {
    throw new Error("Google Drive storage backend not implemented yet");
  }

  async createUploadTicket(_orgId: string, _scopeId: string, _filename: string): Promise<UploadTicket> {
    throw new Error("Google Drive storage backend not implemented yet");
  }
}
