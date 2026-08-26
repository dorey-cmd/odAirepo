import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/queries/orgs";
import { createOAuthClient } from "@/lib/googleDrive/oauthClient";
import { encryptToken } from "@/lib/googleDrive/tokenCrypto";

const SETTINGS_PATH = "/settings/google-drive";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const redirectWithError = (message: string) => {
    const target = new URL(SETTINGS_PATH, req.url);
    target.searchParams.set("error", message);
    return NextResponse.redirect(target);
  };

  if (oauthError) return redirectWithError(`Google denied the request: ${oauthError}`);
  if (!code || !state) return redirectWithError("Missing code or state");

  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("gdrive_oauth_state="))
    ?.split("=")[1];
  if (!cookieState || cookieState !== state) return redirectWithError("State mismatch — please try connecting again");

  try {
    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      return redirectWithError(
        "Google did not return a refresh token — disconnect this app at myaccount.google.com/permissions and try again",
      );
    }
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const about = await drive.about.get({ fields: "user(emailAddress)" });

    const orgId = await getCurrentOrgId(supabase);

    const { error: upsertError } = await supabase.from("storage_connections").upsert(
      {
        org_id: orgId,
        provider: "google_drive",
        drive_account_email: about.data.user?.emailAddress ?? null,
        encrypted_refresh_token: encryptToken(tokens.refresh_token),
        access_token: tokens.access_token ?? null,
        access_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        scopes: (tokens.scope ?? "").split(" ").join(","),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
    if (upsertError) return redirectWithError(upsertError.message);

    const response = NextResponse.redirect(new URL(SETTINGS_PATH, req.url));
    response.cookies.delete("gdrive_oauth_state");
    return response;
  } catch (err) {
    return redirectWithError((err as Error).message);
  }
}
