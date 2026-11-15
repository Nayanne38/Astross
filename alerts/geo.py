"""Geography helpers: distance, compass direction and geocoding (OpenStreetMap Nominatim).

Nominatim usage policy: identify the application (generic User-Agent, no personal data), at most
1 request per second, cache results. Addresses typed by users are sent to Nominatim only to find
their coordinates; this is stated in the registration privacy notice.
"""
from __future__ import annotations

import math
import threading
import time
from functools import lru_cache

import httpx

NOMINATIM = "https://nominatim.openstreetmap.org"
HEADERS = {"User-Agent": "Astross-FireAlerts/0.1 (NASA Space Apps 2026 project)", "Accept-Language": "en"}
_lock = threading.Lock()
_last = [0.0]

DIRECTIONS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]
UF = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE",
      "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def direction_pt(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    """Compass direction from point 1 to point 2, in English (8 sectors)."""
    return DIRECTIONS[int((bearing_deg(lat1, lon1, lat2, lon2) + 22.5) // 45) % 8]


def offset(lat: float, lon: float, km: float, bearing: float) -> tuple[float, float]:
    """Point `km` away from (lat, lon) along `bearing` degrees (spherical)."""
    r = 6371.0088
    d, b = km / r, math.radians(bearing)
    p1, l1 = math.radians(lat), math.radians(lon)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), (math.degrees(l2) + 540) % 360 - 180


def bbox_around(lat: float, lon: float, km: float) -> tuple[float, float, float, float]:
    dlat = km / 111.32
    dlon = km / (111.32 * max(math.cos(math.radians(lat)), 0.01))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat


# ------------------------------------------------------------------ Nominatim
def _get(path: str, params: dict) -> list | dict:
    with _lock:                                   # <= 1 request per second (usage policy)
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        try:
            r = httpx.get(f"{NOMINATIM}/{path}", params={**params, "format": "jsonv2"}, headers=HEADERS, timeout=15)
        finally:
            _last[0] = time.time()
    r.raise_for_status()
    return r.json()


def _uf(addr: dict) -> str | None:
    """Region of an address: the UF code in Brazil, the state/province/region name elsewhere."""
    iso = addr.get("ISO3166-2-lvl4", "")
    if iso.startswith("BR-"):
        return iso[3:] if iso[3:] in UF else None
    return addr.get("state") or addr.get("province") or addr.get("region") or addr.get("state_district") or None


def _city(addr: dict) -> str | None:
    for k in ("city", "town", "municipality", "village", "suburb", "county"):
        if addr.get(k):
            return addr[k]
    return None


@lru_cache(maxsize=512)
def geocode(q: str, limit: int = 5, country: str | None = None) -> tuple[dict, ...]:
    """Search an address anywhere in the world (optionally limited to one country, ISO alpha-2)."""
    params = {"q": q, "addressdetails": 1, "limit": limit}
    if country:
        params["countrycodes"] = country.lower()
    rows = _get("search", params)
    out = []
    for r in rows:
        a = r.get("address", {})
        out.append({"label": r.get("display_name", ""), "lat": float(r["lat"]), "lon": float(r["lon"]),
                    "city": _city(a), "state": _uf(a)})
    return tuple(out)


@lru_cache(maxsize=256)
def geocode_city(city: str, state: str = "", country: str = "") -> dict | None:
    """City/municipality centre and bounding box (w, s, e, n) — used for firefighter coverage areas."""
    params = {"city": city, "addressdetails": 1, "limit": 5}
    if state:
        params["state"] = state
    if country:
        params["countrycodes"] = country.lower()
    rows = _get("search", params)
    if state:
        rows = [r for r in rows if (_uf(r.get("address", {})) or "").lower() == state.lower()] or rows
    if not rows:
        return None
    r = next((x for x in rows if x.get("addresstype") in ("municipality", "city", "town")), rows[0])
    s, n, w, e = (float(v) for v in r["boundingbox"])
    a = r.get("address", {})
    return {"label": r.get("display_name", ""), "lat": float(r["lat"]), "lon": float(r["lon"]),
            "city": _city(a) or city, "state": _uf(a) or (state.upper() if len(state) == 2 else state) or None,
            "country": (a.get("country_code") or country or "").upper() or None, "bbox": (w, s, e, n)}


@lru_cache(maxsize=2048)
def reverse(lat: float, lon: float) -> dict:
    """Human place name for a point: 'Zona rural de Balsas (MA)' style, best effort."""
    try:
        r = _get("reverse", {"lat": round(lat, 4), "lon": round(lon, 4), "zoom": 12, "addressdetails": 1})
    except (httpx.HTTPError, ValueError):
        return {"label": f"{lat:.3f}°, {lon:.3f}°", "city": None, "state": None}
    a = r.get("address", {}) if isinstance(r, dict) else {}
    city, uf = _city(a), _uf(a)
    near = False
    if not city:                       # rural area, water, park: name the nearest municipality instead
        try:
            r2 = _get("reverse", {"lat": round(lat, 4), "lon": round(lon, 4), "zoom": 8, "addressdetails": 1})
            a2 = r2.get("address", {}) if isinstance(r2, dict) else {}
            city, uf, near = _city(a2), uf or _uf(a2), bool(_city(a2))
        except (httpx.HTTPError, ValueError):
            pass
    if city and uf:
        label = f"Near {city} ({uf})" if near else f"{city} ({uf})"
    elif uf:
        label = f"Rural area ({uf}) · {lat:.3f}°, {lon:.3f}°"
    else:
        label = f"{lat:.3f}°, {lon:.3f}°"
    return {"label": label, "city": city, "state": uf, "country": (a.get("country_code") or "").upper() or None}
