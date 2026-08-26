import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/db/queries/orgs";
import { getDriveClientForOrg, DriveNotConnectedError } from "@/lib/googleDrive/tokenManager";

/** Short-lived access token for the client-side Google Picker (drive.file scope only). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const orgId = await getCurrentOrgId(supabase);
    const admin = createAdminClient();
    const oauth2Client = await getDriveClientForOrg(admin, orgId);
    const { token } = await oauth2Client.getAccessToken();
    if (!token) throw new Error("Could not obtain an access token");
    return NextResponse.json({ accessToken: token });
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return NextResponse.json({ error: "Google Drive not connected" }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
