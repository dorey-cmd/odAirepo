export default function StepProgress({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      {steps.map((step, i) => (
        <div key={step} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.82rem",
              color: i <= activeIndex ? "var(--navy)" : "var(--text-muted)",
              fontWeight: i === activeIndex ? 600 : 400,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: i < activeIndex ? "var(--success)" : i === activeIndex ? "var(--gold)" : "var(--border)",
                animation: i === activeIndex ? "badge-pulse 1.2s ease-in-out infinite" : undefined,
              }}
            />
            {step}
          </span>
          {i < steps.length - 1 && <span style={{ color: "var(--border)" }}>•</span>}
        </div>
      ))}
    </div>
  );
}
