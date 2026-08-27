"use client";

import { useId, useState } from "react";
import { UploadCloud } from "lucide-react";

export default function DropZone({
  onFile,
  accept,
  disabled,
  label,
  hint,
}: {
  onFile: (file: File) => void;
  accept: string;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputId = useId();

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      style={{
        border: `2px dashed ${dragOver ? "var(--gold)" : "var(--border)"}`,
        borderRadius: 12,
        padding: "1.5rem 1rem",
        textAlign: "center",
        background: dragOver ? "rgba(201, 162, 39, 0.08)" : "var(--surface-sunken)",
        transition: "border-color 0.15s ease, background 0.15s ease",
      }}
    >
      <input
        type="file"
        id={inputId}
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />
      <label
        htmlFor={inputId}
        className="stack"
        style={{ alignItems: "center", gap: "0.4rem", cursor: disabled ? "default" : "pointer" }}
      >
        <UploadCloud size={26} color="var(--gold-ink)" />
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{hint}</span>
      </label>
    </div>
  );
}
