import Image from "next/image";

export default function Logo({ size = 34, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 9,
          overflow: "hidden",
          background: "var(--navy)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image
          src="/brand/logo.png"
          alt="OdAI"
          width={size}
          height={size}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          priority
        />
      </div>
      {showWordmark && (
        <span
          style={{
            fontFamily: "var(--font-serif), Georgia, serif",
            fontWeight: 700,
            fontSize: "1.25rem",
            color: "var(--navy)",
            letterSpacing: "0.02em",
          }}
        >
          OdAI
        </span>
      )}
    </div>
  );
}
