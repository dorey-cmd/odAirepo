export default function UploadProgressBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="stack" style={{ gap: "0.3rem", minWidth: 180 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)" }}>
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <progress
        value={percent}
        max={100}
        style={{
          width: "100%",
          height: 6,
          accentColor: "var(--gold)",
        }}
      />
    </div>
  );
}
