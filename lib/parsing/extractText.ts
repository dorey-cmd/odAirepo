/**
 * Best-effort text extraction for environment/contract file uploads.
 * No OCR - a scanned/image-only PDF returns empty text (known MVP gap,
 * see plan §"Known Open Risks").
 */
export async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const lower = filename.toLowerCase();

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
