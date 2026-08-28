/**
 * Transcribes an audio file via AssemblyAI so recordings (e.g. a lawyer
 * dictating guidelines) can feed into extracted_text like any other
 * document - same downstream path for both the environment guidelines
 * context and chat attachments. No-ops if ASSEMBLYAI_API_KEY isn't
 * configured yet, so audio uploads still succeed (just without a
 * transcript) rather than failing the whole upload.
 *
 * This is separate from the live mic dictation in the chat input, which
 * uses the browser's native Web Speech API and never touches this file.
 */
export async function transcribeAudio(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    console.warn(`ASSEMBLYAI_API_KEY not configured - skipping transcription for ${filename}`);
    return "";
  }

  const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/octet-stream" },
    body: new Uint8Array(buffer),
  });
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => "");
    throw new Error(`AssemblyAI upload failed (${uploadRes.status}): ${body}`);
  }
  const { upload_url } = await uploadRes.json();

  const transcriptRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, language_code: "he" }),
  });
  if (!transcriptRes.ok) {
    const body = await transcriptRes.text().catch(() => "");
    throw new Error(`AssemblyAI transcript request failed (${transcriptRes.status}): ${body}`);
  }
  const { id } = await transcriptRes.json();

  const pollUrl = `https://api.assemblyai.com/v2/transcript/${id}`;
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const pollRes = await fetch(pollUrl, { headers: { authorization: apiKey } });
    if (!pollRes.ok) {
      const body = await pollRes.text().catch(() => "");
      throw new Error(`AssemblyAI poll failed (${pollRes.status}): ${body}`);
    }
    const data = await pollRes.json();
    if (data.status === "completed") return data.text ?? "";
    if (data.status === "error") throw new Error(`AssemblyAI transcription error: ${data.error}`);
  }

  throw new Error(`AssemblyAI transcription for ${filename} timed out after ${maxAttempts * 3}s`);
}
