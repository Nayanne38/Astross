import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { LangGate } from "@/components/lang-gate";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });

export const metadata: Metadata = {
  title: "FIRETRACK",
  description: "MODIS + VIIRS satellite heat detections for the Brazilian Cerrado, 2003 to today.",
};
export const viewport: Viewport = { themeColor: "#0b6f5f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${grotesk.variable}`}>
      <body>
        <Suspense fallback={<div className="skeleton m-4 h-12" aria-hidden />}>
          <LangGate>
            <AppShell>{children}</AppShell>
          </LangGate>
        </Suspense>
      </body>
    </html>
  );
}
