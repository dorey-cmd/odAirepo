"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown } from "lucide-react";
import ContractStatusBadge from "@/components/ContractStatusBadge";
import type { ContractStatus } from "@/types/contract";

interface AdminContractRow {
  id: string;
  title: string | null;
  status: ContractStatus;
  updated_at: string;
  orgName: string;
  environmentName: string;
}

type SortKey = "org" | "title" | "environment" | "status" | "updated_at";

export default function AdminContractsTable({ rows: allRows }: { rows: AdminContractRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortAsc, setSortAsc] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allRows.filter(
      (c) =>
        (c.title ?? c.id).toLowerCase().includes(q) ||
        c.orgName.toLowerCase().includes(q) ||
        c.environmentName.toLowerCase().includes(q),
    );
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "org") cmp = a.orgName.localeCompare(b.orgName, "he");
      else if (sortKey === "title") cmp = (a.title ?? a.id).localeCompare(b.title ?? b.id, "he");
      else if (sortKey === "environment") cmp = a.environmentName.localeCompare(b.environmentName, "he");
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [allRows, query, sortKey, sortAsc]);

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
        placeholder="חיפוש לפי ארגון, סביבה או שם חוזה..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ maxWidth: 320 }}
      />
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <SortHeader label="ארגון" sortKeyValue="org" />
              <SortHeader label="שם החוזה" sortKeyValue="title" />
              <SortHeader label="סביבה" sortKeyValue="environment" />
              <SortHeader label="סטטוס" sortKeyValue="status" />
              <SortHeader label="עודכן לאחרונה" sortKeyValue="updated_at" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.orgName}</td>
                <td>
                  <Link href={`/contracts/${c.id}`}>{c.title ?? c.id}</Link>
                </td>
                <td>{c.environmentName}</td>
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
