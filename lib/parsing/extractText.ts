/**
 * Best-effort text extraction for environment/contract file uploads.
 * No OCR - a scanned/image-only PDF returns empty text (known MVP gap,
 * see plan §"Known Open Risks"). Audio files are transcribed via AssemblyAI -
 * this is the one shared entry point used by both environment guideline
 * uploads and contract chat attachments, so a recorded voice memo becomes
 * usable text either way.
 */
export async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const lower = filename.toLowerCase();

  if (mimeType.startsWith("audio/") || /\.(mp3|m4a|wav|ogg)$/.test(lower)) {
    const { transcribeAudio } = await import("@/lib/audio/transcribe");
    return transcribeAudio(buffer, filename, mimeType);
  }

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) {
    return buffer.toString("utf-8");
  }

  return "";
}
