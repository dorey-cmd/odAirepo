import Image from "next/image";

const LOGO_ASPECT = 1536 / 1024;

export default function Logo({
  height = 64,
  showWordmark = true,
  context = "default",
}: {
  height?: number;
  showWordmark?: boolean;
  context?: "default" | "topbar" | "hero";
}) {
  const width = Math.round(height * LOGO_ASPECT);

  return (
    <div className={`brand-logo brand-logo-${context}`} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <Image
        src="/brand/logo.png"
        alt="OdAI"
        width={width}
        height={height}
        className="brand-logo-img"
        style={{ width, height, objectFit: "contain", flexShrink: 0 }}
        priority
      />
      {showWordmark && (
        <div className="brand-logo-text stack" style={{ gap: "0.15rem" }}>
          <span
            className="brand-logo-title"
            style={{
              fontFamily: "var(--font-sans), sans-serif",
              fontWeight: 600,
              fontSize: "1.856rem",
              color: "var(--text-muted)",
              letterSpacing: "0.16em",
            }}
          >
            odAi
          </span>
          <span
            className="brand-logo-tagline"
            style={{
              fontFamily: "var(--font-sans), sans-serif",
              fontWeight: 500,
              fontSize: "0.825rem",
              color: "var(--text-muted)",
              letterSpacing: "0.02em",
              marginInlineStart: "0.2rem",
            }}
          >
            פחות עבודה. יותר עריכת דין.
          </span>
        </div>
      )}
    </div>
  );
}
