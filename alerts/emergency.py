"""Fire-service emergency numbers by ISO-3166 alpha-2 country (used in alert texts).

Written from public sources; people should verify locally. Fallback is 112, which works in the EU
and is redirected to the local emergency number on most mobile networks worldwide.
"""
FIRE = {
    "BR": "193", "US": "911", "CA": "911", "MX": "911", "PT": "112", "ES": "112", "DE": "112", "IE": "112",
    "FR": "18", "IT": "115", "GR": "199", "GB": "999", "AU": "000", "NZ": "111", "ZA": "10177", "IN": "101",
    "JP": "119", "CN": "119", "KR": "119", "AR": "100", "CL": "132", "CO": "119", "PE": "116", "BO": "119",
    "PY": "132", "UY": "104", "EC": "911", "VE": "171", "ID": "113", "PH": "911", "TH": "199", "VN": "114",
    "TR": "110", "RU": "101", "UA": "101", "NG": "112", "KE": "999", "AO": "115", "MZ": "198",
}
FALLBACK = "112"


def fire_number(country: str | None) -> str:
    return FIRE.get((country or "").upper(), FALLBACK)


def footer(country: str | None) -> str:
    n = fire_number(country)
    extra = " · <b>199</b> (Civil Defense)" if (country or "").upper() == "BR" else ""
    return ("<i>Data: NASA FIRMS (MODIS/VIIRS satellites). A heat hotspot detected by satellite may not be a "
            f"confirmed fire.</i>\nEmergency: <b>{n}</b> (fire service){extra}")
