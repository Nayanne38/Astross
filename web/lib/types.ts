// Mirrors api/schemas.py 1:1 (same snake_case field names, no mapping layer).


export interface Region { key: string; name: string; name_en?: string; group?: string; live?: boolean; progress?: number | null; bbox: [number, number, number, number]; data_start: string | null; data_end: string | null }
export interface Meta { regions: Region[]; default_region: string; h3_resolution: number; daily_window_start: string | null; last_etl_run: Record<string, string> | null; attribution: string }

export interface CalendarCell {
  year: number; month: number; value: number; modis_cell_days: number; viirs_cell_days: number;
  hotspot_count: number; obs_days: number; is_partial: boolean; daily_mean: number;
  percentile: number | null; anomaly_zscore: number | null; is_top: boolean; deviation_pct?: number | null;
}
export interface CalendarResponse { region: string; area: "region" | "custom"; unit: string; start: string; end: string; cells: CalendarCell[]; current: CalendarCell | null; learn?: Learn | null }

export type AnomalyCategory = "muito_abaixo" | "abaixo" | "normal" | "acima" | "muito_acima" | "indisponivel";
export interface Anomaly { year: number; month: number; value: number; percentile: number | null; anomaly_zscore: number | null; is_partial: boolean; obs_days: number; category: AnomalyCategory; sentence: string }
export interface RiskSummary { available: boolean; forecast_date: string | null; horizon_days: number; n_cells: number; n_high: number; n_very_high: number; mean_probability: number | null; message: string }
export interface Summary {
  region: string; start: string; end: string; total_hotspots: number; total_harmonized: number;
  monthly_mean: number; same_month_mean: number | null; current: Anomaly | null; peak: CalendarCell | null;
  risk_next_7_days: RiskSummary; comparison?: Comparison | null;
}

export interface HexCell { cell_id: string; lat: number; lon: number; value: number; fire_days: number; modis_count: number; viirs_count: number; frp_sum: number | null; boundary: [number, number][] | null }
export interface HexGridResponse { region: string; start: string; end: string; granularity: "day" | "month"; resolution: number; max_value: number; n_cells?: number; cells: HexCell[]; learn?: Learn | null }

export interface ComparisonPoint { year: number; month: number; modis_cell_days: number | null; viirs_cell_days: number | null; harmonized: number | null; modis_hotspots: number; viirs_hotspots: number }
export interface ComparisonResponse { region: string; series: ComparisonPoint[] }

export interface HarmonizationPoint { year: number; month: number; modis_raw: number | null; viirs_raw: number | null; modis_calibrated: number | null; harmonized: number | null; overlap: boolean }
export interface CalibrationMetric { method: string; scope: string; bias: number | null; rmse: number | null; r2: number | null; overlap_days: number | null }
export interface HarmonizationResponse {
  region: string; method: string; unit: string; calibration_years: number[]; viirs_reference: string[];
  overlap_start: string | null; overlap_end: string | null; series: HarmonizationPoint[]; metrics: CalibrationMetric[]; limitations: string[]; limitations_simple?: string[]; learn?: Learn | null;
}

export interface RecentDay { date: string; harmonized: number | null; modis_fcd: number; viirs_fcd: number; hotspots_total: number }
export interface Detection { lat: number; lon: number; date: string; time_utc: number; satellite: string; sensor_family: string; frp: number | null; confidence_class: string; daynight?: string | null }
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
export interface ForecastResponse { region: string; available: boolean; forecast_date: string | null; horizon_days: number; model_version: string | null; cells: ForecastCell[]; metrics: MlMetrics | null; disclaimer: string; fallback?: ClimatologyFallback | null; learn?: Learn | null }

export interface PriorityArea { nome: string; lat: number; lon: number; probabilidade: number; motivo: string }
export interface Insight {
  titulo: string; resumo: string; areas_prioritarias: PriorityArea[]; fatores: string[];
  confianca: "baixa" | "media" | "alta"; justificativa_confianca: string; limitacoes: string[]; recomendacoes: string[];
}
export interface ForecastInsight { region: string; forecast_date: string; horizon_days: number; audience: "geral" | "professor"; model: string; insight: Insight; disclaimer: string }


export interface Comparison {
  year: number; month: number; days_compared: number; same_days_only: boolean; value: number;
  reference_mean: number | null; deviation_pct: number | null; percentile: number | null; category: string;
  n_ref: number; ref_year_min: number | null; ref_year_max: number | null; is_provisional: boolean; sentence: string;
}
export interface FallbackCell { cell_id: string; frequency: number; risk_class: RiskClass }
export interface ClimatologyFallback { label: string; month: number; cells: FallbackCell[]; ref_year_min: number; ref_year_max: number; thresholds: number[] }
export type Nivel = "simples" | "estudante" | "tecnico";
export interface LearnCard { slot: "situacao" | "cautela" | "contexto"; titulo: string; texto: string }
export interface Learn {
  view: string; nivel: Nivel; lang: string; avisos: string[]; cards: LearnCard[]; nao_diz: string[]; para_pensar: string[];
  ods: { meta: string; texto: string }[]; procedencia: { fonte: string; provisional_from: string; metodo: string; gerado_em: string };
}
export interface GlossaryTerm { id: string; termo: string; definicao: string; simples: string; tecnico: string; armadilha: string; ods: string[] }
