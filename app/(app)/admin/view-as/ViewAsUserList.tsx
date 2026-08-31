"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserRow {
  id: string;
  email: string;
  orgNames: string[];
}

export default function ViewAsUserList({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    return !q || u.email.toLowerCase().includes(q) || u.orgNames.some((n) => n.toLowerCase().includes(q));
  });

  async function startViewAs(userId: string) {
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "שגיאה");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      <input placeholder="חיפוש לפי אימייל או ארגון..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 320 }} />
      {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>משתמש</th>
              <th>ארגון/ים</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.orgNames.join(", ") || "-"}</td>
                <td>
                  <button className="secondary" onClick={() => startViewAs(u.id)} disabled={busyId !== null}>
                    {busyId === u.id ? "מתחבר..." : "צפה כמוהו"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p style={{ color: "var(--text-muted)" }}>אין משתמשים תואמים.</p>}
      </div>
    </div>
  );
}
