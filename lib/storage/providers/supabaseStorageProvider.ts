import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider, StorageRef, StorageUploadInput, UploadTicket } from "@/lib/storage/types";

/**
 * Supabase Storage object keys must be ASCII - a filename with Hebrew (or
 * other non-ASCII) characters fails upload with "Invalid key". The original
 * filename is preserved separately (environment_files.original_filename /
 * contract_files.original_filename), so this only affects the storage path.
 */
function sanitizeForStorageKey(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  const base = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  const ext = lastDot > 0 ? filename.slice(lastDot) : "";
  const safeBase = base
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const safeExt = ext.replace(/[^A-Za-z0-9.]+/g, "");
  return (safeBase || "file") + safeExt;
}

/**
 * Default storage backend. Path convention: {orgId}/{scopeId}/{uuid}-{filename},
 * where scopeId is an environment_id or contract_id - matches the
 * storage.objects RLS policies in supabase/migrations/0001_init_schema.sql,
 * which check (storage.foldername(name))[1] against the caller's org_id.
 */
export class SupabaseStorageProvider implements StorageProvider {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket: string,
  ) {}

  async upload(orgId: string, scopeId: string, file: StorageUploadInput): Promise<StorageRef> {
    const path = `${orgId}/${scopeId}/${crypto.randomUUID()}-${sanitizeForStorageKey(file.filename)}`;
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(path, file.buffer, { contentType: file.mimeType, upsert: false });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
    return { provider: "supabase", path };
  }

  async createUploadTicket(orgId: string, scopeId: string, filename: string): Promise<UploadTicket> {
    const path = `${orgId}/${scopeId}/${crypto.randomUUID()}-${sanitizeForStorageKey(filename)}`;
    const { data, error } = await this.supabase.storage.from(this.bucket).createSignedUploadUrl(path);
    if (error) throw new Error(`Supabase Storage signed upload URL failed: ${error.message}`);
    return { provider: "supabase", bucket: this.bucket, path: data.path, token: data.token, signedUrl: data.signedUrl };
  }

  async download(ref: StorageRef): Promise<Buffer> {
    const { data, error } = await this.supabase.storage.from(this.bucket).download(ref.path);
    if (error) throw new Error(`Supabase Storage download failed: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async getSignedUrl(ref: StorageRef, expiresInSec: number): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(ref.path, expiresInSec);
    if (error) throw new Error(`Supabase Storage signed URL failed: ${error.message}`);
    return data.signedUrl;
  }

  async delete(ref: StorageRef): Promise<void> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([ref.path]);
    if (error) throw new Error(`Supabase Storage delete failed: ${error.message}`);
  }
}
