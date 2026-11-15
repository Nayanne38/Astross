import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { Providers } from "@/components/app-state";
import { AppShell, ShellFallback } from "@/components/app-shell";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FIREWATCH · Calendário de Queimadas",
  description: "Detecções de calor MODIS + VIIRS harmonizadas (NASA FIRMS): mapa, calendário, dados e harmonização.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`dark ${inter.variable} ${grotesk.variable} h-full antialiased`}>
      <body className="min-h-full">
        {/* Filters live in the URL (useSearchParams): the shell renders on the client inside this boundary. */}
        <Suspense fallback={<ShellFallback />}>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
