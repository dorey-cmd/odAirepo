import Image from "next/image";

const LOGO_ASPECT = 1536 / 1024;

export default function Logo({ height = 44, showWordmark = true }: { height?: number; showWordmark?: boolean }) {
  const width = Math.round(height * LOGO_ASPECT);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <div
        style={{
          width,
          height,
          borderRadius: Math.round(height * 0.16),
          overflow: "hidden",
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-ink) 55%, #14315c 100%)",
          boxShadow: "0 4px 14px rgba(11,31,61,0.28), 0 0 0 1px rgba(201,162,39,0.18)",
          flexShrink: 0,
        }}
      >
        <Image
          src="/brand/logo.png"
          alt="OdAI"
          width={width}
          height={height}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          priority
        />
      </div>
      {showWordmark && (
        <span
          style={{
            fontFamily: "var(--font-sans), sans-serif",
            fontWeight: 600,
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          OdAI
        </span>
      )}
    </div>
  );
}
