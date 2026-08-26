import type { SupabaseClient } from "@supabase/supabase-js";
import type { UploadTicket } from "@/lib/storage/types";

/**
 * Consumes an upload ticket from an init-upload endpoint (see
 * lib/storage/types.ts) by putting the file directly to storage from the
 * browser — Supabase via its signed-upload-URL client method, Drive via a
 * plain PUT to the resumable session URL. Bypasses our own server, so large
 * files aren't subject to Vercel's ~4.5MB request body limit.
 */
export async function uploadViaTicket(
  ticket: UploadTicket,
  file: File,
  supabase: SupabaseClient,
): Promise<{ path?: string; driveFileId?: string }> {
  if (ticket.provider === "google_drive") {
    if (!ticket.uploadUrl) throw new Error("Missing Drive upload URL");
    const res = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error(`העלאה ל-Drive נכשלה: ${res.status}`);
    const driveFile = await res.json();
    return { driveFileId: driveFile.id };
  }

  if (!ticket.bucket || !ticket.path || !ticket.token) throw new Error("Malformed upload ticket");
  const { error } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return { path: ticket.path };
}
