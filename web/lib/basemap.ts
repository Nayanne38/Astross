// CARTO Voyager (light) basemap. The old keyless subdomain URL ({s}.basemaps.cartocdn.com/voyager) now answers
// 404 "Not Served"; the /rastertiles/ endpoint works, and with NEXT_PUBLIC_CARTO_KEY set it is the keyed one.
// The key is a public tile key (visible to the browser by design), kept in .env.local / a GitHub variable.
const KEY = process.env.NEXT_PUBLIC_CARTO_KEY;

export const BASEMAP = {
  url: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${KEY ? `?key=${KEY}` : ""}`,
  subdomains: undefined as string | undefined,
};
