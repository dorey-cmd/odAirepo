"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, FolderKanban, FileText, HardDrive, ShieldCheck, Menu, X, UserCog } from "lucide-react";
import Logo from "@/components/Logo";
import NavLink from "./NavLink";
import SignOutButton from "./SignOutButton";

export default function SidebarShell({
  userEmail,
  isAdmin,
  viewAsAdminEmail,
  children,
}: {
  userEmail: string;
  isAdmin: boolean;
  /** Set when a platform admin is currently viewing-as this account - the real admin's email, for the banner. */
  viewAsAdminEmail: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [exiting, setExiting] = useState(false);

  async function exitViewAs() {
    setExiting(true);
    try {
      const res = await fetch("/api/admin/exit-view-as", { method: "POST" });
      if (!res.ok) throw new Error();
      router.push("/admin/view-as");
      router.refresh();
    } finally {
      setExiting(false);
    }
  }

  const nav = (
    <aside
      className="app-sidebar"
      style={{
        background: "var(--gradient-sidebar)",
        display: "flex",
        flexDirection: "column",
        padding: "1.25rem 1rem",
        gap: "1.5rem",
        ...(open ? { transform: "translateX(0)" } : {}),
      }}
    >
      <button
        className="app-hamburger-btn ghost"
        style={{ color: "white", alignSelf: "flex-end" }}
        onClick={() => setOpen(false)}
      >
        <X size={20} />
      </button>

      <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <NavLink href="/dashboard" label="לוח בקרה" icon={LayoutDashboard} />
        <NavLink href="/environments" label="סביבות חוזה" icon={FolderKanban} />
        <NavLink href="/contracts" label="חוזים" icon={FileText} />
        <NavLink href="/settings/google-drive" label="Google Drive" icon={HardDrive} />
        {isAdmin && <NavLink href="/admin" label="ניהול מערכת" icon={ShieldCheck} />}
        {isAdmin && <NavLink href="/admin/view-as" label="View As" icon={UserCog} />}
      </nav>

      <div
        className="sidebar-user"
        style={{
          marginTop: "auto",
          paddingTop: "1rem",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.8rem", wordBreak: "break-all" }}>
          {userEmail}
        </span>
        <SignOutButton iconOnly />
      </div>
    </aside>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {viewAsAdminEmail && (
        <div
          style={{
            background: "var(--gold)",
            color: "var(--navy-ink)",
            padding: "0.5rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            flexWrap: "wrap",
          }}
        >
          <UserCog size={16} />
          <span>
            צופה כ-{userEmail} (Admin: {viewAsAdminEmail})
          </span>
          <button className="ghost" style={{ padding: "0.15rem 0.6rem", color: "var(--navy-ink)" }} onClick={exitViewAs} disabled={exiting}>
            {exiting ? "חוזר..." : "חזרה לעצמי"}
          </button>
        </div>
      )}
      <header className="brand-strip">
        <button className="app-hamburger-btn ghost" onClick={() => setOpen(true)}>
          <Menu size={22} />
        </button>
        <Logo height={122} context="topbar" />
      </header>
      <div style={{ display: "flex", flex: 1 }}>
        {nav}
        {open && <div className="app-sidebar-backdrop" onClick={() => setOpen(false)} />}
        <main style={{ flex: 1, minWidth: 0, maxWidth: 1080, margin: "0 auto", padding: "3.25rem 1.75rem 2rem" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
