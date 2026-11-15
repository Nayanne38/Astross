"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR code rendered locally (no third-party QR service sees the link token). */
export default function QrCode({ value, size = 220, label }: { value: string; size?: number; label?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b0d10", light: "#ffffff" } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => { alive = false; };
  }, [value]);
  return (
    <div className="inline-block rounded-2xl bg-white p-3 shadow-lg" style={{ width: size + 24 }} role="img" aria-label={label ?? "QR code"}>
      {svg ? <div style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
        : <div style={{ width: size, height: size }} className="grid place-items-center text-xs text-gray-500">gerando QR…</div>}
    </div>
  );
}
