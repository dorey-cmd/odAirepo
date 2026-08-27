import { Readable } from "node:stream";
import type { SupabaseClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import type { StorageProvider, StorageRef, StorageUploadInput, UploadTicket } from "@/lib/storage/types";
import { getDriveClientForOrg } from "@/lib/googleDrive/tokenManager";
import type { DriveOAuthClient } from "@/lib/googleDrive/oauthClient";

/**
 * Backs a Contract Environment with the lawyer's own Google Drive. Folder
 * layout: {lawyer's chosen root folder} / {environment name} - every file
 * belonging to that environment (template, guidelines, and every generated
 * contract draft) lives in that one subfolder. `contract_environments.
 * google_drive_root_folder_id` caches that subfolder's id once created.
 *
 * Permission replication: Drive does NOT auto-propagate a folder's sharing
 * to files created inside it via the API (only Shared Drives do, and those
 * need Workspace) - see the plan's Storage Abstraction section. So every
 * upload here explicitly copies the environment folder's permissions onto
 * the new file right after creating it.
 */
export class GoogleDriveStorageProvider implements StorageProvider {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly orgId: string,
  ) {}

  private async getAuth(): Promise<DriveOAuthClient> {
    return getDriveClientForOrg(this.supabase, this.orgId);
  }

  /** scopeId is either an environment_id directly, or a contract_id whose parent environment we resolve. */
  private async resolveEnvironmentId(scopeId: string): Promise<string> {
    const { data: env } = await this.supabase
      .from("contract_environments")
      .select("id")
      .eq("id", scopeId)
      .eq("org_id", this.orgId)
      .maybeSingle();
    if (env) return env.id;

    const { data: contract, error } = await this.supabase
      .from("contracts")
      .select("environment_id")
      .eq("id", scopeId)
      .eq("org_id", this.orgId)
      .single();
    if (error || !contract) throw new Error(`Could not resolve environment for scope ${scopeId}`);
    return contract.environment_id;
  }

  private async ensureEnvironmentFolder(auth: DriveOAuthClient, environmentId: string): Promise<string> {
    const { data: env, error: envError } = await this.supabase
      .from("contract_environments")
      .select("id, name, google_drive_root_folder_id")
      .eq("id", environmentId)
      .single();
    if (envError || !env) throw new Error(`Environment ${environmentId} not found`);
    if (env.google_drive_root_folder_id) return env.google_drive_root_folder_id;

    const { data: connection, error: connError } = await this.supabase
      .from("storage_connections")
      .select("drive_root_folder_id")
      .eq("org_id", this.orgId)
      .maybeSingle();
    if (connError || !connection?.drive_root_folder_id) {
      throw new Error("Google Drive root folder not selected yet - connect Drive and pick a folder first");
    }

    const drive = google.drive({ version: "v3", auth });
    const folder = await drive.files.create({
      requestBody: {
        name: env.name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [connection.drive_root_folder_id],
      },
      fields: "id",
    });
    const folderId = folder.data.id;
    if (!folderId) throw new Error("Drive did not return a folder id");

    await this.supabase
      .from("contract_environments")
      .update({ google_drive_root_folder_id: folderId })
      .eq("id", environmentId);

    return folderId;
  }

  private async replicateFolderPermissions(auth: DriveOAuthClient, folderId: string, fileId: string): Promise<void> {
    const drive = google.drive({ version: "v3", auth });
    const { data } = await drive.permissions.list({
      fileId: folderId,
      fields: "permissions(type,role,emailAddress,domain)",
    });
    for (const perm of data.permissions ?? []) {
      if (perm.role === "owner") continue;
      try {
        await drive.permissions.create({
          fileId,
          sendNotificationEmail: false,
          requestBody: {
            type: perm.type ?? undefined,
            role: perm.role ?? undefined,
            emailAddress: perm.emailAddress ?? undefined,
            domain: perm.domain ?? undefined,
          },
        });
      } catch (err) {
        console.error(`Failed to replicate permission onto Drive file ${fileId}:`, err);
      }
    }
  }

  async upload(_orgId: string, scopeId: string, file: StorageUploadInput): Promise<StorageRef> {
    const auth = await this.getAuth();
    const environmentId = await this.resolveEnvironmentId(scopeId);
    const folderId = await this.ensureEnvironmentFolder(auth, environmentId);

    const drive = google.drive({ version: "v3", auth });
    const created = await drive.files.create({
      requestBody: { name: file.filename, parents: [folderId] },
      media: { mimeType: file.mimeType, body: Readable.from(file.buffer) },
      fields: "id",
    });
    const fileId = created.data.id;
    if (!fileId) throw new Error("Drive did not return a file id");

    await this.replicateFolderPermissions(auth, folderId, fileId);
    return { provider: "google_drive", path: "", driveFileId: fileId };
  }

  async createUploadTicket(
    _orgId: string,
    scopeId: string,
    filename: string,
    mimeType: string,
  ): Promise<UploadTicket> {
    const auth = await this.getAuth();
    const environmentId = await this.resolveEnvironmentId(scopeId);
    const folderId = await this.ensureEnvironmentFolder(auth, environmentId);
    const { token } = await auth.getAccessToken();
    if (!token) throw new Error("Could not obtain a Drive access token");

    // Resumable upload session: the client PUTs the file bytes directly to the
    // returned Location URL, bypassing our own server (and Vercel's body-size
    // limit) - same motivation as Supabase's signed upload URL.
    const initRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
      },
      body: JSON.stringify({ name: filename, parents: [folderId] }),
    });
    if (!initRes.ok) {
      throw new Error(`Drive resumable upload initiation failed: ${initRes.status} ${await initRes.text()}`);
    }
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) throw new Error("Drive did not return a resumable upload URL");

    return { provider: "google_drive", uploadUrl };
  }

  /** Called after the client's direct PUT to the resumable session completes, to replicate permissions. */
  async finalizeUploadedFile(scopeId: string, driveFileId: string): Promise<void> {
    const auth = await this.getAuth();
    const environmentId = await this.resolveEnvironmentId(scopeId);
    const folderId = await this.ensureEnvironmentFolder(auth, environmentId);
    await this.replicateFolderPermissions(auth, folderId, driveFileId);
  }

  async download(ref: StorageRef): Promise<Buffer> {
    if (!ref.driveFileId) throw new Error("Missing driveFileId");
    const auth = await this.getAuth();
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get(
      { fileId: ref.driveFileId, alt: "media" },
      { responseType: "arraybuffer" },
    );
    return Buffer.from(res.data as ArrayBuffer);
  }

  async getSignedUrl(ref: StorageRef, _expiresInSec: number): Promise<string> {
    if (!ref.driveFileId) throw new Error("Missing driveFileId");
    const auth = await this.getAuth();
    const drive = google.drive({ version: "v3", auth });
    const { data } = await drive.files.get({ fileId: ref.driveFileId, fields: "webContentLink,webViewLink" });
    const url = data.webContentLink ?? data.webViewLink;
    if (!url) throw new Error("Drive did not return a viewable link for this file");
    return url;
  }

  async delete(ref: StorageRef): Promise<void> {
    if (!ref.driveFileId) throw new Error("Missing driveFileId");
    const auth = await this.getAuth();
    const drive = google.drive({ version: "v3", auth });
    await drive.files.delete({ fileId: ref.driveFileId });
  }
}
