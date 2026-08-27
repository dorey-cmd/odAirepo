import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/db/queries/admin";
import SidebarShell from "./SidebarShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isAdmin = await isPlatformAdmin(supabase);

  return (
    <SidebarShell userEmail={user.email ?? ""} isAdmin={isAdmin}>
      {children}
    </SidebarShell>
  );
}
