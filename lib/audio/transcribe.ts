/**
 * Transcribes an audio file via OpenAI's Whisper API so recordings (e.g. a
 * lawyer dictating guidelines) can feed into extracted_text like any other
 * document - same downstream path for both the environment guidelines
 * context and chat attachments. No-ops if OPENAI_API_KEY isn't configured
 * yet, so audio uploads still succeed (just without a transcript) rather
 * than failing the whole upload.
 */
export async function transcribeAudio(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(`OPENAI_API_KEY not configured - skipping transcription for ${filename}`);
    return "";
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Whisper transcription failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.text ?? "";
}
