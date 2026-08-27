"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown } from "lucide-react";
import ContractStatusBadge from "@/components/ContractStatusBadge";
import type { Contract } from "@/types/contract";

type SortKey = "title" | "updated_at" | "status";

export default function EnvironmentContractsTable({ contracts }: { contracts: Contract[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortAsc, setSortAsc] = useState(false);

  const rows = useMemo(() => {
    const filtered = contracts.filter((c) => (c.title ?? c.id).toLowerCase().includes(query.trim().toLowerCase()));
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = (a.title ?? a.id).localeCompare(b.title ?? b.id, "he");
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [contracts, query, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function SortHeader({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) {
    return (
      <th
        onClick={() => toggleSort(sortKeyValue)}
        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          {label}
          <ArrowUpDown size={12} style={{ opacity: sortKey === sortKeyValue ? 1 : 0.35 }} />
        </span>
      </th>
    );
  }

  return (
    <div className="stack">
      <input
        placeholder="חיפוש חוזה..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ maxWidth: 280 }}
      />
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <SortHeader label="שם החוזה" sortKeyValue="title" />
              <SortHeader label="סטטוס" sortKeyValue="status" />
              <SortHeader label="עודכן לאחרונה" sortKeyValue="updated_at" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/contracts/${c.id}`}>{c.title ?? c.id}</Link>
                </td>
                <td>
                  <ContractStatusBadge contractId={c.id} initialStatus={c.status} />
                </td>
                <td>{new Date(c.updated_at).toLocaleString("he-IL")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p style={{ color: "var(--text-muted)" }}>אין חוזים תואמים.</p>}
      </div>
    </div>
  );
}
