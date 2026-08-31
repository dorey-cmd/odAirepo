import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/db/queries/admin";
import { VIEW_AS_STASH_COOKIE, type ViewAsStash } from "@/lib/admin/viewAs";
import SidebarShell from "./SidebarShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isAdmin = await isPlatformAdmin(supabase);

  const cookieStore = await cookies();
  const stashRaw = cookieStore.get(VIEW_AS_STASH_COOKIE)?.value;
  let viewAs: ViewAsStash | null = null;
  if (stashRaw) {
    try {
      viewAs = JSON.parse(stashRaw) as ViewAsStash;
    } catch {
      // malformed stash - ignore, exit-view-as will clear it on next use
    }
  }

  return (
    <SidebarShell userEmail={user.email ?? ""} isAdmin={isAdmin} viewAsAdminEmail={viewAs?.adminEmail ?? null}>
      {children}
    </SidebarShell>
  );
}
