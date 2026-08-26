import type { SupabaseClient } from "@supabase/supabase-js";
import { createOAuthClient, type DriveOAuthClient } from "@/lib/googleDrive/oauthClient";
import { decryptToken } from "@/lib/googleDrive/tokenCrypto";

export class DriveNotConnectedError extends Error {
  constructor(orgId: string) {
    super(`Org ${orgId} has no Google Drive connection`);
  }
}

/**
 * Returns an OAuth2Client authenticated for this org's Drive connection.
 * googleapis auto-refreshes the access token from the refresh token when it's
 * missing/expired; the 'tokens' listener persists a refreshed access token
 * back to storage_connections so most calls don't need a fresh refresh.
 */
export async function getDriveClientForOrg(admin: SupabaseClient, orgId: string): Promise<DriveOAuthClient> {
  const { data: connection, error } = await admin
    .from("storage_connections")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!connection?.encrypted_refresh_token) throw new DriveNotConnectedError(orgId);

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: decryptToken(connection.encrypted_refresh_token),
    access_token: connection.access_token ?? undefined,
    expiry_date: connection.access_token_expires_at
      ? new Date(connection.access_token_expires_at).getTime()
      : undefined,
  });

  oauth2Client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    admin
      .from("storage_connections")
      .update({
        access_token: tokens.access_token,
        access_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId)
      .then(({ error: updateError }) => {
        if (updateError) console.error("Failed to persist refreshed Drive token:", updateError.message);
      });
  });

  return oauth2Client;
}

export async function getDriveConnection(admin: SupabaseClient, orgId: string) {
  const { data, error } = await admin
    .from("storage_connections")
    .select("org_id, provider, drive_account_email, drive_root_folder_id, created_at")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
