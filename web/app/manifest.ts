import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FIRETRACK — Alertas de Incêndio",
    short_name: "FIRETRACK",
    description: "Alertas de focos de calor (NASA FIRMS) perto de você, no Telegram.",
    start_url: "/alertas",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
