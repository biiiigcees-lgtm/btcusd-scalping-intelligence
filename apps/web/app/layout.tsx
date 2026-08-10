import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTCUSD Scalping Intelligence",
  description: "Non-executing quantitative research & decision-support platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased font-mono">{children}</body>
    </html>
  );
}
