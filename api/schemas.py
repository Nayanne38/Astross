"""Response models. web/lib/fire-data.ts mirrors these interfaces 1:1 (camelCase not used:
field names are identical in Python and TypeScript to avoid a mapping layer)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ------------------------------------------------------------------ educational layer (learn)
# docs/EDUCACAO_ODS.md §10.2. Deterministic pt-BR texts built by api/education.py.
Nivel = Literal["simples", "estudante", "tecnico"]
View = Literal["calendario", "resumo", "mapa", "comparacao", "harmonizacao", "recentes", "previsao"]
CaveatCode = Literal["sintetico", "nrt", "era_modis", "custom_pre2012", "parcial", "n_ref_pequeno",
                     "truncado", "previsao_indisponivel", "mensal_aproximado"]


class LearnCard(BaseModel):
    id: str = Field(description="stable id, e.g. 'mapa.concentracao.alta'")
    slot: Literal["situacao", "cautela", "contexto"]
    gatilho: str = Field(description="human-readable trigger rule")
    titulo: str
    texto: str
    dica_professor: Optional[str] = None


class Caveat(BaseModel):
    codigo: CaveatCode
    texto: str


class GuidedQuestion(BaseModel):
    tipo: Literal["ver", "pensar", "perguntar", "limite_do_dado", "cidadania"]
    texto: str


class Provenance(BaseModel):
    fonte: str
    atualizado_em: Optional[str] = Field(None, description="finished_at of the last successful ETL run")
    provisional_from: Optional[date] = Field(None, description="first day of near-real-time (provisional) data seen")
    provisional_exact: bool = Field(False, description="false: provisional data may start before provisional_from")
    eras: list[str]
    is_synthetic: bool
    metodo: Optional[str] = None


class Accessible(BaseModel):
    alt_curto: str = Field(description="<=150 chars, for aria-label")
    descricao_longa: str
    falavel: str = Field(description="screen-reader friendly: no symbols like −, ≥, ~, ×")
    destaques: list[str] = []


class Learn(BaseModel):
    version: str = "learn-1"
    view: View
    nivel: Nivel
    cards: list[LearnCard]
    nao_diz: list[str] = Field(min_length=1, description="what this data does NOT say (mandatory)")
    avisos: list[Caveat]
    perguntas: list[GuidedQuestion]
    procedencia: Provenance
    acessivel: Accessible
    glossario: list[str] = Field(description="ids in GET /glossary")
    ods: list[str] = Field(description="UN SDG targets this view contributes to")


class GlossaryTerm(BaseModel):
    id: str
    termo: str
    definicao: str = Field(description="definition at the requested level")
    simples: str
    tecnico: str
    armadilha: str
    ods: list[str]


class PathStep(BaseModel):
    ordem: int
    objetivo: str
    view: str
    endpoint: str
    params: dict
    card_id: str
    pergunta_saida: str


class LearningPath(BaseModel):
    id: str
    titulo: str
    publico: str
    ods: list[str]
    bncc: list[str]
    bncc_status: str = "a verificar por docente"
    bloqueada: bool
    motivo_bloqueio: Optional[str] = None
    etapas: list[PathStep]


class ProvenanceResponse(BaseModel):
    region: str
    procedencia: Provenance
    resumo: str
    limitacoes: list[str]
    limitacoes_simples: list[str]


class Region(BaseModel):
    key: str
    name: str
    bbox: list[float] = Field(description="[west, south, east, north]")
    data_start: Optional[date] = None
    data_end: Optional[date] = None


class Meta(BaseModel):
    regions: list[Region]
    default_region: str
    h3_resolution: int
    daily_window_start: Optional[date] = Field(None, description="first day with daily cell data in the DB")
    last_etl_run: Optional[dict] = None
    attribution: str


class CalendarCell(BaseModel):
    year: int
    month: int
    value: float = Field(description="harmonized fire-cell-days (VIIRS-equivalent)")
    modis_cell_days: int
    viirs_cell_days: int
    hotspot_count: int = Field(description="region: quality-filtered detections (all satellites); "
                                           "custom area: detections after cross-satellite dedup")
    obs_days: int
    is_partial: bool
    daily_mean: float
    percentile: Optional[float] = None
    anomaly_zscore: Optional[float] = None
    is_top: bool = Field(False, description="among the top-N months of the selected period")


class CalendarResponse(BaseModel):
    region: str
    area: Literal["region", "custom"]
    unit: str
    start: date
    end: date
    cells: list[CalendarCell]
    current: Optional[CalendarCell] = None
    learn: Optional[Learn] = None


class Anomaly(BaseModel):
    year: int
    month: int
    value: float
    percentile: Optional[float]
    anomaly_zscore: Optional[float]
    is_partial: bool
    obs_days: int
    category: Literal["muito_abaixo", "abaixo", "normal", "acima", "muito_acima", "indisponivel"] = Field(
        description="from percentile: <10, <33, 33-67, <=90, >90")
    sentence: str = Field(description="pt-BR explanation (technical level, kept for compatibility)")
    sentences: dict[str, str] = Field(default_factory=dict, description="same text per level: simples/estudante/tecnico")
    daily_mean: Optional[float] = None
    n_ref: int = Field(0, description="complete years of the same month used as reference")
    ref_year_min: Optional[int] = None
    ref_year_max: Optional[int] = None
    is_provisional: bool = Field(False, description="month includes near-real-time (provisional) days")


class RiskSummary(BaseModel):
    available: bool
    forecast_date: Optional[date] = None
    horizon_days: int = 7
    n_cells: int = 0
    n_high: int = 0
    n_very_high: int = 0
    mean_probability: Optional[float] = None
    message: str


class Summary(BaseModel):
    region: str
    start: date
    end: date
    total_hotspots: int = Field(description="quality-filtered detections, all satellites")
    total_harmonized: float
    monthly_mean: float = Field(description="mean harmonized fire-cell-days per complete month (period)")
    same_month_mean: Optional[float] = Field(None, description="historical mean for the current calendar month")
    current: Optional[Anomaly] = None
    peak: Optional[CalendarCell] = None
    risk_next_7_days: RiskSummary
    learn: Optional[Learn] = None


class HexCell(BaseModel):
    cell_id: str
    lat: float
    lon: float
    value: float = Field(description="harmonized fire-cell-days in the period")
    fire_days: int
    modis_count: int
    viirs_count: int
    frp_sum: Optional[float] = None
    boundary: Optional[list[list[float]]] = Field(None, description="[[lat, lon], ...]")


class HexGridResponse(BaseModel):
    region: str
    start: date
    end: date
    granularity: Literal["day", "month"]
    resolution: int
    max_value: float
    n_cells: int = Field(0, description="cells with value > 0 (before limit)")
    total_value: float = 0.0
    top10_share: Optional[float] = Field(None, description="share of total value in the top 10% cells (n_cells>=10)")
    cells: list[HexCell]
    learn: Optional[Learn] = None


class ComparisonPoint(BaseModel):
    year: int
    month: int
    modis_cell_days: Optional[int]
    viirs_cell_days: Optional[int]
    harmonized: Optional[float]
    modis_hotspots: int
    viirs_hotspots: int
    viirs_modis_ratio: Optional[float] = Field(None, description="viirs_cell_days / modis_cell_days")


class ComparisonResponse(BaseModel):
    region: str
    series: list[ComparisonPoint]
    learn: Optional[Learn] = None


class HarmonizationPoint(BaseModel):
    year: int
    month: int
    modis_raw: Optional[float]
    viirs_raw: Optional[float]
    modis_calibrated: Optional[float]
    harmonized: Optional[float]
    overlap: bool


class CalibrationMetric(BaseModel):
    method: str
    scope: str
    bias: Optional[float]
    rmse: Optional[float]
    r2: Optional[float]
    overlap_days: Optional[int]


class HarmonizationResponse(BaseModel):
    region: str
    method: str
    unit: str
    calibration_years: list[int]
    viirs_reference: list[str]
    overlap_start: Optional[date]
    overlap_end: Optional[date]
    series: list[HarmonizationPoint]
    metrics: list[CalibrationMetric]
    limitations: list[str]
    limitations_simple: list[str] = []
    learn: Optional[Learn] = None


class RecentDay(BaseModel):
    date: date
    harmonized: Optional[float]
    modis_fcd: int
    viirs_fcd: int
    hotspots_total: int


class Detection(BaseModel):
    lat: float
    lon: float
    date: date
    time_utc: int
    satellite: str
    sensor_family: str
    frp: Optional[float]
    confidence_class: str


class RecentResponse(BaseModel):
    region: str
    days: list[RecentDay]
    detections: list[Detection]
    truncated: bool
    share_high_confidence: Optional[float] = None
    learn: Optional[Learn] = None


class ForecastCell(BaseModel):
    cell_id: str
    lat: float
    lon: float
    probability: float
    risk_class: str
    boundary: Optional[list[list[float]]] = None


class ForecastResponse(BaseModel):
    region: str
    available: bool
    forecast_date: Optional[date] = None
    horizon_days: int
    model_version: Optional[str] = None
    cells: list[ForecastCell]
    metrics: Optional[dict] = Field(None, description="evaluation metrics vs baselines (Phase 5)")
    disclaimer: str
    learn: Optional[Learn] = None


class Health(BaseModel):
    status: str
    database: str
    time: datetime
