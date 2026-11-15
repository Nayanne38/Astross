import { Suspense } from "react";
import FocoView from "./FocoView";

export const metadata = { title: "Foco de calor — FIRETRACK" };

export default function FocoPage() {
  return <Suspense fallback={<p className="text-muted">Carregando…</p>}><FocoView /></Suspense>;
}
