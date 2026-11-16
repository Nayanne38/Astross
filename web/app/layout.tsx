import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { LangGate } from "@/components/lang-gate";
import { LangGateStatic } from "@/components/lang-gate-static";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });

export const metadata: Metadata = {
  title: "FIRETRACK",
  ...(process.env.NEXT_PUBLIC_STATIC === "1" ? { manifest: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/manifest.webmanifest` } : {}),
  description: "MODIS + VIIRS satellite heat detections for the Brazilian Cerrado, 2003 to today.",
};
export const viewport: Viewport = { themeColor: "#0b6f5f", width: "device-width", initialScale: 1 };

const Gate = process.env.NEXT_PUBLIC_STATIC === "1" ? LangGateStatic : LangGate;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body>
        <Suspense fallback={<div className="skeleton m-4 h-12" aria-hidden />}>
          <Gate>
            <AppShell>{children}</AppShell>
          </Gate>
        </Suspense>
      </body>
    </html>
  );
}
