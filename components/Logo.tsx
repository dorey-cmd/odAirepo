import Image from "next/image";

export default function Logo({ size = 34, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          overflow: "hidden",
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-ink) 55%, #14315c 100%)",
          boxShadow: "0 4px 14px rgba(11,31,61,0.28), 0 0 0 1px rgba(201,162,39,0.18)",
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
