"use client";

import { useEffect, useState } from "react";
import QrCode from "@/components/QrCode";

/** QR that points to the sign-up page, for posters at schools, health posts and fire stations. */
export default function PosterQr({ path = "/alertas", title = "Spread the word about alerts" }: { path?: string; title?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { const id = setTimeout(() => setUrl(new URL(path, window.location.origin).toString()), 0); return () => clearTimeout(id); }, [path]);
  return (
    <div className="card flex flex-col items-center text-center">
      <p className="kicker">{title}</p>
      <p className="mt-1 text-sm text-muted">Print this QR for schools, health clinics and fire stations: anyone who scans it opens the sign-up on their phone.</p>
      <div className="mt-4">{url ? <QrCode value={url} size={170} label="QR code for alert sign-up" /> : <div className="h-[194px]" />}</div>
      <p className="mt-2 break-all text-xs text-muted">{url}</p>
      <button className="btn-ghost mt-3 print:hidden" onClick={() => window.print()}>🖨️ Print poster</button>
    </div>
  );
}
