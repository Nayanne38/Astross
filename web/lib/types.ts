// Mirrors api/schemas.py (field names identical, no mapping layer). Only fields the UI uses.

export type Category = "muito_abaixo" | "abaixo" | "normal" | "acima" | "muito_acima" | "indisponivel";

export interface LearnCard { id: string; slot: "situacao" | "cautela" | "contexto"; titulo: string; texto: string; dica_professor?: string | null }
export interface Caveat { codigo: string; texto: string }
export interface Learn {
  view: string; nivel: string; cards: LearnCard[]; nao_diz: string[]; avisos: Caveat[];
  perguntas: { tipo: string; texto: string }[];
  procedencia: { fonte: string; atualizado_em?: string | null; provisional_from?: string | null; is_synthetic: boolean; eras: string[] };
  acessivel: { alt_curto: string; descricao_longa: string; falavel: string; destaques: string[] };
  glossario: string[]; ods: string[];
}

export interface Region { key: string; name: string; bbox: number[]; data_start?: string | null; data_end?: string | null }
export interface Meta {
  regions: Region[]; default_region: string; h3_resolution: number; daily_window_start?: string | null;
  last_etl_run?: { run_id: string; mode: string; finished_at: string } | null; attribution: string;
}

export interface CalendarCell {
  year: number; month: number; value: number; modis_cell_days: number; viirs_cell_days: number;
  hotspot_count: number; obs_days: number; is_partial: boolean; daily_mean: number;
  percentile?: number | null; anomaly_zscore?: number | null; is_top: boolean; deviation_pct?: number | null;
}
export interface CalendarResponse { region: string; area: string; unit: string; start: string; end: string; cells: CalendarCell[]; current?: CalendarCell | null; learn?: Learn | null }

export interface MonthComparison {
  year: number; month: number; days_compared: number; same_days_only: boolean; value: number;
  ref_mean?: number | null; deviation_pct?: number | null; percentile?: number | null; category: Category;
  label: string; n_ref: number; ref_year_min?: number | null; ref_year_max?: number | null;
  is_provisional: boolean; sentence: string;
}
export interface Summary {
  region: string; start: string; end: string; total_hotspots: number; total_harmonized: number;
  monthly_mean: number; same_month_mean?: number | null; comparison?: MonthComparison | null;
  current?: { sentence: string; sentences: Record<string, string>; category: Category; percentile?: number | null } | null;
  peak?: CalendarCell | null; learn?: Learn | null;
}

export interface HexCell { cell_id: string; lat: number; lon: number; value: number; fire_days: number; modis_count: number; viirs_count: number; frp_sum?: number | null }
export interface HexGridResponse { region: string; start: string; end: string; granularity: "day" | "month"; resolution: number; max_value: number; n_cells: number; total_value: number; top10_share?: number | null; cells: HexCell[]; learn?: Learn | null }

export interface Detection { lat: number; lon: number; date: string; time_utc: number; satellite: string; sensor_family: "MODIS" | "VIIRS"; frp?: number | null; confidence_class: string }
export interface RecentResponse { region: string; days: { date: string; harmonized?: number | null; modis_fcd: number; viirs_fcd: number; hotspots_total: number }[]; detections: Detection[]; truncated: boolean; learn?: Learn | null }

export interface HarmonizationPoint { year: number; month: number; modis_raw?: number | null; viirs_raw?: number | null; modis_calibrated?: number | null; harmonized?: number | null; overlap: boolean }
export interface CalibrationMetric { method: string; scope: string; bias?: number | null; rmse?: number | null; r2?: number | null; overlap_days?: number | null }
export interface HarmonizationResponse {
  region: string; method: string; unit: string; calibration_years: number[]; viirs_reference: string[];
  overlap_start?: string | null; overlap_end?: string | null; series: HarmonizationPoint[]; metrics: CalibrationMetric[];
  limitations: string[]; limitations_simple: string[]; learn?: Learn | null;
}

export interface ClimatologyFallback {
  label: string; method: string; month: number; ref_year_min: number; ref_year_max: number;
  thresholds: Record<string, number>; thresholds_status: string; region_mean: number;
  region_class: "baixo" | "moderado" | "alto" | "muito_alto"; n_cells: number; truncated: boolean;
  cells: { cell_id: string; frequency: number; risk_class: string }[];
}
export interface ForecastResponse {
  region: string; available: boolean; forecast_date?: string | null; horizon_days: number; model_version?: string | null;
  cells: { cell_id: string; lat: number; lon: number; probability: number; risk_class: string }[];
  metrics?: Record<string, unknown> | null; disclaimer: string; fallback?: ClimatologyFallback | null; learn?: Learn | null;
}

export interface GlossaryTerm { id: string; termo: string; definicao: string; simples: string; tecnico: string; armadilha: string; ods: string[] }
