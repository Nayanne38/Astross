"""Response models. web/lib/fire-data.ts mirrors these interfaces 1:1 (camelCase not used:
field names are identical in Python and TypeScript to avoid a mapping layer)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from api.edu import Learn


class Region(BaseModel):
    key: str
    name: str
    bbox: list[float] = Field(description="[west, south, east, north]")
    data_start: Optional[date] = None
    data_end: Optional[date] = None
    name_en: str = ""
    group: str = ""
    live: bool = Field(False, description="NRT-only monitoring tier (FIRMS last 1-5 days, no history in the DB)")
    progress: Optional[float] = Field(None, description="series still processing: share of years done (0-1)")


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
    deviation_pct: Optional[float] = Field(None, description="% deviation of daily_mean vs the mean of the same month in previous complete years (min 3)")


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
    sentence: str = Field(description="plain-language pt-BR explanation")


class Comparison(BaseModel):
    """Current month vs. the same days (partial month) or the same month (complete) in previous years."""
    year: int
    month: int
    days_compared: int
    same_days_only: bool
    value: float = Field(description="harmonized fire-cell-days in the compared days")
    reference_mean: Optional[float] = None
    deviation_pct: Optional[float] = None
    percentile: Optional[float] = None
    category: Literal["muito_abaixo", "abaixo", "normal", "acima", "muito_acima", "indisponivel"]
    n_ref: int
    ref_year_min: Optional[int] = None
    ref_year_max: Optional[int] = None
    is_provisional: bool
    sentence: str


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
    comparison: Optional[Comparison] = None
    risk_next_7_days: RiskSummary


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
    n_cells: int = Field(0, description="cells with value > 0 before `limit`")
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


class ComparisonResponse(BaseModel):
    region: str
    series: list[ComparisonPoint]


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
    daynight: Optional[str] = Field(None, description="D | N")


class RecentResponse(BaseModel):
    region: str
    days: list[RecentDay]
    detections: list[Detection]
    truncated: bool


class WorldRegionCount(BaseModel):
    key: str
    name: str
    count: int


class WorldResponse(BaseModel):
    days: int
    total: int
    latest: Optional[date] = None
    detections: list[Detection]
    truncated: bool
    top_regions: list[WorldRegionCount]


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
    fallback: Optional["ClimatologyFallback"] = None
    learn: Optional[Learn] = None


class FallbackCell(BaseModel):
    cell_id: str
    frequency: float = Field(description="fraction of reference years with a VIIRS detection in the month")
    risk_class: str


class ClimatologyFallback(BaseModel):
    label: str
    month: int
    cells: list[FallbackCell]
    ref_year_min: int
    ref_year_max: int
    thresholds: list[float] = Field(description="frequency limits between baixo|moderado|alto|muito_alto")


class ForecastInsight(BaseModel):
    region: str
    forecast_date: date
    horizon_days: int
    audience: Literal["geral", "professor"]
    model: str = Field(description="Claude model id that wrote the text")
    insight: dict = Field(description="titulo, resumo, areas_prioritarias, fatores, confianca, limitacoes, recomendacoes")
    disclaimer: str


class Health(BaseModel):
    status: str
    database: str
    time: datetime
