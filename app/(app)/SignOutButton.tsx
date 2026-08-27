"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (iconOnly) {
    return (
      <button
        className="ghost sidebar-signout-trigger"
        onClick={signOut}
        title="התנתקות"
        aria-label="התנתקות"
        style={{ padding: "0.4rem", color: "rgba(255,255,255,0.75)" }}
      >
        <LogOut size={16} />
      </button>
    );
  }

  return (
    <button className="secondary" onClick={signOut}>
      התנתקות
    </button>
  );
}
