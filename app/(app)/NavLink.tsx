"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export default function NavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.7rem",
        padding: "0.6rem 0.9rem",
        borderRadius: 8,
        color: active ? "var(--navy-ink)" : "rgba(255,255,255,0.82)",
        background: active ? "var(--gold)" : "transparent",
        fontWeight: active ? 600 : 500,
        transition: "background 0.15s ease, color 0.15s ease",
      }}
    >
      <Icon size={18} strokeWidth={2} />
      <span>{label}</span>
    </Link>
  );
}
