import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OdAI — סביבות חוזה",
  description: "Contract Environments for lawyers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
