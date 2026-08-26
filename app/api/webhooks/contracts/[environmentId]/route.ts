import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnvironmentStorageProvider } from "@/lib/storage/factory";
import { extractBearerToken, tokensMatch } from "@/lib/webhooks/verifyToken";
import { processIntakeEvent } from "@/lib/webhooks/intakeProcessor";

export const runtime = "nodejs";

/**
 * Generic contract-intake webhook. Any external system (CRM, form service,
 * GHL, Make/n8n) can POST here — see plan §"Webhook Intake Pipeline".
 *
 * This route authenticates + logs the raw event fast, then schedules the slow
 * part (field extraction via Claude, contract + chat creation — see
 * lib/webhooks/intakeProcessor.ts) to run via Next.js `after()` so the caller
 * gets its 202 without waiting. `after()` runs post-response in the same
 * invocation, on Vercel and locally alike — simpler than the DB-webhook hop
 * originally sketched in the plan, which would need a publicly reachable URL
 * for Supabase to call back into anyway.
 */
export async function POST(req: Request, context: { params: Promise<{ environmentId: string }> }) {
  const { environmentId } = await context.params;
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: environment, error: envError } = await admin
    .from("contract_environments")
    .select("id, org_id, webhook_token, status, storage_provider")
    .eq("id", environmentId)
    .maybeSingle();

  if (envError) return NextResponse.json({ error: envError.message }, { status: 500 });
  if (!environment) return NextResponse.json({ error: "Unknown environment" }, { status: 404 });
  if (!tokensMatch(token, environment.webhook_token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  if (environment.status !== "active") {
    return NextResponse.json({ error: "Environment is archived" }, { status: 409 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let rawPayload: unknown = null;
  const rawFiles: Array<{ filename: string; mime_type: string; storage_path: string }> = [];

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const payloadField = form.get("payload");
      rawPayload = payloadField ? JSON.parse(String(payloadField)) : null;

      const storage = getEnvironmentStorageProvider(
        { org_id: environment.org_id, storage_provider: environment.storage_provider },
        admin,
      );
      for (const [, value] of form.entries()) {
        if (value instanceof File) {
          const buffer = Buffer.from(await value.arrayBuffer());
          const ref = await storage.upload(environment.org_id, `${environment.id}/intake`, {
            buffer,
            filename: value.name,
            mimeType: value.type || "application/octet-stream",
          });
          rawFiles.push({ filename: value.name, mime_type: value.type, storage_path: ref.path });
        }
      }
    } else {
      rawPayload = await req.json();
    }
  } catch (err) {
    return NextResponse.json({ error: `Could not parse request body: ${(err as Error).message}` }, { status: 400 });
  }

  const { data: event, error: insertError } = await admin
    .from("webhook_intake_events")
    .insert({
      environment_id: environment.id,
      org_id: environment.org_id,
      source_ip: req.headers.get("x-forwarded-for"),
      content_type: contentType,
      raw_payload: rawPayload,
      raw_files: rawFiles,
      verified: true,
      processing_status: "received",
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  after(() =>
    processIntakeEvent(event.id).catch((err) => console.error(`processIntakeEvent(${event.id}) failed:`, err)),
  );

  return NextResponse.json({ eventId: event.id }, { status: 202 });
}
