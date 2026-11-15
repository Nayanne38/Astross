// CARTO Voyager (light) basemap. With NEXT_PUBLIC_CARTO_KEY set we use the keyed raster endpoint; without it we
// fall back to the keyless subdomain URL. The key is a public tile key (it is visible to the browser by
// design), kept in .env.local, never in the repo.
const KEY = process.env.NEXT_PUBLIC_CARTO_KEY;

export const BASEMAP = KEY
  ? { url: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${KEY}`, subdomains: undefined as string | undefined }
  : { url: "https://{s}.basemaps.cartocdn.com/voyager/{z}/{x}/{y}{r}.png", subdomains: "abcd" as string | undefined };
