import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AppStateProvider } from "@/components/app-state";
import { AppShell } from "@/components/app-shell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Calendário de Queimadas",
  description: "Detecções de calor MODIS + VIIRS harmonizadas (NASA FIRMS): mapa, calendário, dados e harmonização.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppStateProvider>
          <AppShell>{children}</AppShell>
        </AppStateProvider>
      </body>
    </html>
  );
}
