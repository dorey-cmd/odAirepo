import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseStorageProvider } from "@/lib/storage/providers/supabaseStorageProvider";
import { GoogleDriveStorageProvider } from "@/lib/storage/providers/googleDriveProvider";
import type { StorageProvider, StorageProviderKind } from "@/lib/storage/types";

interface EnvironmentStorageConfig {
  org_id: string;
  storage_provider: StorageProviderKind;
}

function build(
  config: EnvironmentStorageConfig,
  supabase: SupabaseClient,
  bucket: string,
): StorageProvider {
  if (config.storage_provider === "google_drive") {
    return new GoogleDriveStorageProvider(config.org_id);
  }
  return new SupabaseStorageProvider(supabase, bucket);
}

/** For Contract Environment assets: template, guidelines, reference files. */
export function getEnvironmentStorageProvider(
  config: EnvironmentStorageConfig,
  supabase: SupabaseClient,
): StorageProvider {
  return build(config, supabase, "environment-files");
}

/** For per-contract assets: intake uploads and generated draft versions. */
export function getContractStorageProvider(
  config: EnvironmentStorageConfig,
  supabase: SupabaseClient,
): StorageProvider {
  return build(config, supabase, "contract-files");
}
