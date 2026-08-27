"use client";

import { useState } from "react";
import Link from "next/link";

interface OrgRow {
  id: string;
  name: string;
  createdAt: string;
  envCount: number;
  contractCount: number;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
}

export default function AdminOrgsTable({ rows }: { rows: OrgRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="stack">
      <input
        placeholder="חיפוש ארגון..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ maxWidth: 280 }}
      />
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>שם</th>
              <th>נוצר</th>
              <th>סביבות</th>
              <th>חוזים</th>
              <th>Input tokens</th>
              <th>Output tokens</th>
              <th>עלות משוערת</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/orgs/${r.id}`}>{r.name}</Link>
                </td>
                <td>{r.createdAt}</td>
                <td>{r.envCount}</td>
                <td>{r.contractCount}</td>
                <td>{r.inputTokens.toLocaleString()}</td>
                <td>{r.outputTokens.toLocaleString()}</td>
                <td>${r.estCostUsd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p style={{ color: "var(--text-muted)" }}>אין ארגונים תואמים.</p>}
      </div>
    </div>
  );
}
