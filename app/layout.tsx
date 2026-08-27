import type { Metadata } from "next";
import { Frank_Ruhl_Libre, Rubik } from "next/font/google";
import "./globals.css";

const serif = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["500", "700"],
  variable: "--font-serif",
});

const sans = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "OdAI - סביבות חוזה",
  description: "Contract Environments for lawyers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
