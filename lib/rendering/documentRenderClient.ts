/** HTTP client for services/document-renderer (see plan §"Document Rendering Service"). */

function baseUrl(): string {
  const url = process.env.DOCUMENT_RENDERER_URL;
  if (!url) throw new Error("DOCUMENT_RENDERER_URL is not set");
  return url;
}

export async function extractStyleCatalog(templateBuffer: Buffer, filename: string): Promise<unknown> {
  const form = new FormData();
  form.append("template", new Blob([new Uint8Array(templateBuffer)]), filename);

  const res = await fetch(`${baseUrl()}/extract-style-catalog`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`extract-style-catalog failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function renderDocument(
  templateBuffer: Buffer,
  templateFilename: string,
  contentTree: unknown,
): Promise<Buffer> {
  const form = new FormData();
  form.append("template", new Blob([new Uint8Array(templateBuffer)]), templateFilename);
  form.append("content_tree", JSON.stringify(contentTree));

  const res = await fetch(`${baseUrl()}/render`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`render failed (${res.status}): ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
