import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/queries/orgs";
import { getDriveConnection } from "@/lib/googleDrive/tokenManager";
import DrivePicker from "./DrivePicker";

export default async function GoogleDriveSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  const connection = await getDriveConnection(supabase, orgId);
  const pickerApiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;

  return (
    <div className="stack">
      <h1>חיבור Google Drive</h1>
      <p style={{ color: "var(--text-muted)" }}>
        חבר/י את Google Drive שלך כדי לאפשר לסביבות חוזה לשמור קבצים ישירות ב-Drive שלך במקום באחסון
        הפנימי. תבחר/י תיקייה ראשית אחת - המערכת תיצור בתוכה תת-תיקייה לכל סביבת חוזה.
      </p>

      {error && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <p style={{ color: "var(--danger)", margin: 0 }}>{decodeURIComponent(error)}</p>
        </div>
      )}

      <div className="card stack">
        {!connection ? (
          <>
            <p style={{ margin: 0 }}>לא מחובר.</p>
            <a href="/api/integrations/google-drive/connect">
              <button>חבר/י את Google Drive</button>
            </a>
          </>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              מחובר כ-<strong>{connection.drive_account_email}</strong>
            </p>
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
              תיקייה ראשית:{" "}
              {connection.drive_root_folder_id ? (
                <span>נבחרה ✓</span>
              ) : (
                <span>עדיין לא נבחרה</span>
              )}
            </p>
            {pickerApiKey ? (
              <DrivePicker apiKey={pickerApiKey} />
            ) : (
              <p style={{ color: "var(--danger)" }}>NEXT_PUBLIC_GOOGLE_PICKER_API_KEY אינו מוגדר.</p>
            )}
            <a href="/api/integrations/google-drive/connect">
              <button className="secondary">חבר/י חשבון Google אחר</button>
            </a>
          </>
        )}
      </div>
    </div>
  );
}
