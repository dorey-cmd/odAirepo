"use client";

import { useState } from "react";
import { LayoutDashboard, FolderKanban, FileText, HardDrive, ShieldCheck, Menu, X } from "lucide-react";
import Logo from "@/components/Logo";
import NavLink from "./NavLink";
import SignOutButton from "./SignOutButton";

export default function SidebarShell({
  userEmail,
  isAdmin,
  children,
}: {
  userEmail: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

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
      <header className="brand-strip">
        <button className="app-hamburger-btn ghost" onClick={() => setOpen(true)}>
          <Menu size={22} />
        </button>
        <Logo size={30} />
      </header>
      <div style={{ display: "flex", flex: 1 }}>
        {nav}
        {open && <div className="app-sidebar-backdrop" onClick={() => setOpen(false)} />}
        <main style={{ flex: 1, minWidth: 0, maxWidth: 1080, margin: "0 auto", padding: "2rem 1.75rem" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
