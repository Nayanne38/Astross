// Mirrors api/schemas.py 1:1 (same snake_case field names, no mapping layer).

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export interface Region { key: string; name: string; name_en?: string; group?: string; live?: boolean; bbox: [number, number, number, number]; data_start: string | null; data_end: string | null }
export interface Meta { regions: Region[]; default_region: string; h3_resolution: number; daily_window_start: string | null; last_etl_run: Record<string, string> | null; attribution: string }

export interface CalendarCell {
  year: number; month: number; value: number; modis_cell_days: number; viirs_cell_days: number;
  hotspot_count: number; obs_days: number; is_partial: boolean; daily_mean: number;
  percentile: number | null; anomaly_zscore: number | null; is_top: boolean;
}
export interface CalendarResponse { region: string; area: "region" | "custom"; unit: string; start: string; end: string; cells: CalendarCell[]; current: CalendarCell | null }

export type AnomalyCategory = "muito_abaixo" | "abaixo" | "normal" | "acima" | "muito_acima" | "indisponivel";
export interface Anomaly { year: number; month: number; value: number; percentile: number | null; anomaly_zscore: number | null; is_partial: boolean; obs_days: number; category: AnomalyCategory; sentence: string }
export interface RiskSummary { available: boolean; forecast_date: string | null; horizon_days: number; n_cells: number; n_high: number; n_very_high: number; mean_probability: number | null; message: string }
export interface Summary {
  region: string; start: string; end: string; total_hotspots: number; total_harmonized: number;
  monthly_mean: number; same_month_mean: number | null; current: Anomaly | null; peak: CalendarCell | null;
  risk_next_7_days: RiskSummary;
}

export interface HexCell { cell_id: string; lat: number; lon: number; value: number; fire_days: number; modis_count: number; viirs_count: number; frp_sum: number | null; boundary: [number, number][] | null }
export interface HexGridResponse { region: string; start: string; end: string; granularity: "day" | "month"; resolution: number; max_value: number; cells: HexCell[] }

export interface ComparisonPoint { year: number; month: number; modis_cell_days: number | null; viirs_cell_days: number | null; harmonized: number | null; modis_hotspots: number; viirs_hotspots: number }
export interface ComparisonResponse { region: string; series: ComparisonPoint[] }

export interface HarmonizationPoint { year: number; month: number; modis_raw: number | null; viirs_raw: number | null; modis_calibrated: number | null; harmonized: number | null; overlap: boolean }
export interface CalibrationMetric { method: string; scope: string; bias: number | null; rmse: number | null; r2: number | null; overlap_days: number | null }
export interface HarmonizationResponse {
  region: string; method: string; unit: string; calibration_years: number[]; viirs_reference: string[];
  overlap_start: string | null; overlap_end: string | null; series: HarmonizationPoint[]; metrics: CalibrationMetric[]; limitations: string[];
}

export interface RecentDay { date: string; harmonized: number | null; modis_fcd: number; viirs_fcd: number; hotspots_total: number }
export interface Detection { lat: number; lon: number; date: string; time_utc: number; satellite: string; sensor_family: string; frp: number | null; confidence_class: string }
export interface RecentResponse { region: string; days: RecentDay[]; detections: Detection[]; truncated: boolean }

export type RiskClass = "baixo" | "moderado" | "alto" | "muito_alto";
export interface ForecastCell { cell_id: string; lat: number; lon: number; probability: number; risk_class: RiskClass; boundary: [number, number][] | null }
export interface ModelScores { roc_auc: number | null; pr_auc: number | null; brier: number; ece?: number; top10_capture: number | null }
export interface MlMetrics {
  model_version: string; trained_at: string; target: string; horizon_days: number; data_window: [string, string];
  n_cells: number; train: { rows: number; origins: [string, string]; positive_rate: number };
  test: { rows: number; origins: [string, string]; positive_rate: number };
  metrics: { model: ModelScores; persistence: ModelScores; climatology: ModelScores };
  beats_baselines_pr_auc: Record<string, boolean>; feature_importance_gain: Record<string, number>; notes: string[];
  source?: "parquet" | "db"; hyperparameters?: Record<string, number>;
  test_by_year?: Record<string, { rows: number; pr_auc: number | null; climatology_pr_auc: number | null }>;
}
export interface ForecastResponse { region: string; available: boolean; forecast_date: string | null; horizon_days: number; model_version: string | null; cells: ForecastCell[]; metrics: MlMetrics | null; disclaimer: string }

export interface PriorityArea { nome: string; lat: number; lon: number; probabilidade: number; motivo: string }
export interface Insight {
  titulo: string; resumo: string; areas_prioritarias: PriorityArea[]; fatores: string[];
  confianca: "baixa" | "media" | "alta"; justificativa_confianca: string; limitacoes: string[]; recomendacoes: string[];
}
export interface ForecastInsight { region: string; forecast_date: string; horizon_days: number; audience: "geral" | "professor"; model: string; insight: Insight; disclaimer: string }

// ------------------------------------------------------------------ fetching
import { STATIC, staticCsv, staticUrl } from "./static-data";
export type Params = Record<string, string | number | boolean | undefined | null>;

export function apiUrl(path: string, params: Params = {}): string {
  if (STATIC) return path === "/export.csv" ? staticCsv(params) : (staticUrl(path, params) ?? "#");
  const u = new URL(path, API_URL);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  return u.toString();
}

export async function api<T>(path: string, params: Params = {}, init?: RequestInit): Promise<T> {
  if (STATIC && apiUrl(path, params) === "#") throw new Error("This view is not available in the static (GitHub Pages) edition.");
  const r = await fetch(apiUrl(path, params), init);
  if (!r.ok) {
    let detail = r.statusText;
    try { detail = (await r.json()).detail ?? detail; } catch { /* not json */ }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return r.json() as Promise<T>;
}

// ------------------------------------------------------------------ formatting / palettes
export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MESES_LONGOS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-BR");
export const fmtNum = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtPct = (v: number, d = 0) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: d })}%`;
export const fmtDate = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("pt-BR");

// sequential fire ramp (light -> dark), used for counts
export const FIRE_RAMP = ["#fff1c1", "#fec44f", "#fe9929", "#ec7014", "#cc4c02", "#8c2d04", "#4a1402"];
export function fireColor(v: number, max: number): string {
  if (!max || v <= 0) return "transparent";
  const t = Math.min(1, Math.log1p(v) / Math.log1p(max));
  return FIRE_RAMP[Math.min(FIRE_RAMP.length - 1, Math.floor(t * FIRE_RAMP.length))];
}

export const RISK: Record<RiskClass, { label: string; color: string; range: string }> = {
  baixo: { label: "Baixo", color: "#3b82f6", range: "< 10%" },
  moderado: { label: "Moderado", color: "#facc15", range: "10–30%" },
  alto: { label: "Alto", color: "#f97316", range: "30–60%" },
  muito_alto: { label: "Muito alto", color: "#dc2626", range: "≥ 60%" },
};
