import { google } from "googleapis";

export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

/**
 * Use this type (not a direct import of OAuth2Client from google-auth-library)
 * everywhere a Drive OAuth client is passed around — googleapis bundles its
 * own nested copy of google-auth-library via googleapis-common, and a
 * separately-installed top-level copy is a structurally-identical but
 * nominally different type, which TypeScript then rejects.
 */
export type DriveOAuthClient = ReturnType<typeof createOAuthClient>;
