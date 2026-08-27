import Image from "next/image";

const LOGO_ASPECT = 1536 / 1024;

export default function Logo({ height = 64, showWordmark = true }: { height?: number; showWordmark?: boolean }) {
  const width = Math.round(height * LOGO_ASPECT);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <Image
        src="/brand/logo.png"
        alt="OdAI"
        width={width}
        height={height}
        style={{ width, height, objectFit: "contain", flexShrink: 0 }}
        priority
      />
      {showWordmark && (
        <span
          style={{
            fontFamily: "var(--font-sans), sans-serif",
            fontWeight: 600,
            fontSize: "1.125rem",
            color: "var(--text-muted)",
            letterSpacing: "0.16em",
          }}
        >
          odAi
        </span>
      )}
    </div>
  );
}
