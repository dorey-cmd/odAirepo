import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/db/queries/admin";
import SignOutButton from "./SignOutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isAdmin = await isPlatformAdmin(supabase);

  return (
    <div>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem 1.5rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <nav style={{ display: "flex", gap: "1.25rem" }}>
          <Link href="/dashboard">OdAI</Link>
          <Link href="/environments">סביבות חוזה</Link>
          <Link href="/contracts">חוזים</Link>
          {isAdmin && <Link href="/admin">ניהול מערכת</Link>}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ color: "var(--text-muted)" }}>{user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem" }}>{children}</main>
    </div>
  );
}
