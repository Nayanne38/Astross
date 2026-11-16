// GitHub Pages (static export) cannot serve the dynamic app/manifest.ts route: swap it for a static file.
import fs from "node:fs";
const bp = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
fs.rmSync("app/manifest.ts", { force: true });
fs.writeFileSync("public/manifest.webmanifest", JSON.stringify({
  name: "FIRETRACK — Fire alerts", short_name: "FIRETRACK",
  description: "Satellite heat-hotspot alerts (NASA FIRMS) near you, on Telegram.",
  start_url: `${bp}/alertas/`, scope: `${bp}/`, display: "standalone", orientation: "portrait",
  background_color: "#0b0d10", theme_color: "#0b0d10", lang: "en",
  icons: [{ src: `${bp}/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" }],
}, null, 2));
fs.writeFileSync("public/.nojekyll", "");
console.log("pages: manifest swapped");
