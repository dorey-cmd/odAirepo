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
        background: "var(--navy)",
        display: "flex",
        flexDirection: "column",
        padding: "1.25rem 1rem",
        gap: "1.5rem",
        ...(open ? { transform: "translateX(0)" } : {}),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <Logo size={30} showWordmark={false} />
          <span
            style={{
              color: "white",
              fontFamily: "var(--font-serif), Georgia, serif",
              fontWeight: 700,
              fontSize: "1.1rem",
            }}
          >
            OdAI
          </span>
        </div>
        <button className="app-hamburger-btn ghost" style={{ color: "white" }} onClick={() => setOpen(false)}>
          <X size={20} />
        </button>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <NavLink href="/dashboard" label="לוח בקרה" icon={LayoutDashboard} />
        <NavLink href="/environments" label="סביבות חוזה" icon={FolderKanban} />
        <NavLink href="/contracts" label="חוזים" icon={FileText} />
        <NavLink href="/settings/google-drive" label="Google Drive" icon={HardDrive} />
        {isAdmin && <NavLink href="/admin" label="ניהול מערכת" icon={ShieldCheck} />}
      </nav>

      <div
        style={{
          marginTop: "auto",
          paddingTop: "1rem",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem",
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.85rem", wordBreak: "break-all" }}>
          {userEmail}
        </span>
        <SignOutButton />
      </div>
    </aside>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {nav}
      {open && <div className="app-sidebar-backdrop" onClick={() => setOpen(false)} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="app-mobile-topbar"
          style={{
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <button className="ghost" onClick={() => setOpen(true)}>
            <Menu size={22} />
          </button>
          <Logo size={26} />
        </div>
        <main style={{ maxWidth: 1080, margin: "0 auto", padding: "2rem 1.75rem" }}>{children}</main>
      </div>
    </div>
  );
}
