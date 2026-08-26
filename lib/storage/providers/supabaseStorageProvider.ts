import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider, StorageRef, StorageUploadInput } from "@/lib/storage/types";

/**
 * Default storage backend. Path convention: {orgId}/{scopeId}/{uuid}-{filename},
 * where scopeId is an environment_id or contract_id — matches the
 * storage.objects RLS policies in supabase/migrations/0001_init_schema.sql,
 * which check (storage.foldername(name))[1] against the caller's org_id.
 */
export class SupabaseStorageProvider implements StorageProvider {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket: string,
  ) {}

  async upload(orgId: string, scopeId: string, file: StorageUploadInput): Promise<StorageRef> {
    const path = `${orgId}/${scopeId}/${crypto.randomUUID()}-${file.filename}`;
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(path, file.buffer, { contentType: file.mimeType, upsert: false });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
    return { provider: "supabase", path };
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
