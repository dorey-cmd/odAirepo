import type { UploadTicket } from "@/lib/storage/types";

/**
 * Consumes an upload ticket from an init-upload endpoint (see
 * lib/storage/types.ts) by putting the file directly to storage from the
 * browser - Drive via a plain PUT to the resumable session URL, Supabase via
 * the same multipart request its own uploadToSignedUrl() sends. Both use
 * XMLHttpRequest (not fetch) so upload.onprogress gives real byte-level
 * progress. Bypasses our own server, so large files aren't subject to
 * Vercel's ~4.5MB request body limit.
 */
export function uploadViaTicket(
  ticket: UploadTicket,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ path?: string; driveFileId?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("שגיאת רשת בהעלאה"));

    if (ticket.provider === "google_drive") {
      if (!ticket.uploadUrl) return reject(new Error("Missing Drive upload URL"));
      xhr.open("PUT", ticket.uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          return reject(new Error(`העלאה ל-Drive נכשלה: ${xhr.status}`));
        }
        const driveFile = JSON.parse(xhr.responseText);
        resolve({ driveFileId: driveFile.id });
      };
      xhr.send(file);
      return;
    }

    if (!ticket.signedUrl || !ticket.path) return reject(new Error("Malformed upload ticket"));
    xhr.open("PUT", ticket.signedUrl);
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        return reject(new Error(`העלאה נכשלה: ${xhr.status}`));
      }
      resolve({ path: ticket.path });
    };
    // Mirrors supabase-js's uploadToSignedUrl() body shape exactly - the
    // storage server expects a multipart body with an unnamed file field.
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}
