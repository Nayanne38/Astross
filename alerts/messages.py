"""Alert texts (Telegram HTML). Citizen format requested by the team:

  "Hello {name}, there is a fire hotspot near your registered location, {place in the app}
   {protection advice}"
"""
from __future__ import annotations

import os
from html import escape
from urllib.parse import urlencode

from alerts.firms_live import Fire
from alerts.geo import direction_pt, haversine_km

from alerts.emergency import fire_number, footer


def app_url() -> str:
    return os.getenv("APP_PUBLIC_URL", "http://localhost:3000").rstrip("/")


def fire_link(f: Fire, place: str) -> str:
    q = urlencode({"lat": f"{f.lat:.5f}", "lon": f"{f.lon:.5f}", "sat": f.satellite, "t": f.when_local, "local": place})
    return f"{app_url()}/foco?{q}"


def maps_link(lat: float, lon: float) -> str:
    return f"https://www.google.com/maps?q={lat:.5f},{lon:.5f}"


def protection_tips(age: int | None, country: str | None = None) -> list[str]:
    tips = [
        f"Do not try to put out the fire yourself: call {fire_number(country)}.",
        "Close doors and windows to keep smoke out; if there is smoke, cover your nose and mouth with a damp cloth.",
        "Keep documents, medication, water and a charged phone at hand, and agree on an exit route with your family.",
        "Do not burn trash or pruning debris, and move flammable materials away from the house.",
        "If the flames get close, leave in the direction away from the wind and smoke, and follow Civil Defense guidance.",
    ]
    if age is not None and age >= 60:
        tips.insert(1, "Older people or those with respiratory conditions should avoid exertion and seek care at the first sign of shortness of breath.")
    if age is not None and age < 18:
        tips.insert(0, "Tell a responsible adult now.")
    return tips


def citizen_alert(name: str, age: int | None, home: tuple[float, float], f: Fire, place: str,
                  n_more: int = 0, test: bool = False, country: str | None = None) -> str:
    first = escape(name.split()[0] if name.strip() else name)
    d = haversine_km(home[0], home[1], f.lat, f.lon)
    dist = f"{d:.1f}"
    where = direction_pt(home[0], home[1], f.lat, f.lon)
    head = "🧪 <b>TEST ALERT (simulated)</b>\n\n" if test else "🔥 <b>Fire alert — Astross</b>\n\n"
    more = f"\n➕ {n_more} more hotspot(s) detected within the monitored radius." if n_more else ""
    tips = "\n".join(f"• {escape(t)}" for t in protection_tips(age, country))
    frp = f" · intensity {f.frp:.0f} MW" if f.frp is not None else ""
    return (
        f"{head}Hello <b>{first}</b>, there is a fire hotspot near your registered location, "
        f"<a href=\"{escape(fire_link(f, place))}\">see the location in the app</a>.\n\n"
        f"📍 <b>{escape(place)}</b> — {dist} km {where} of your address.\n"
        f"🛰️ {escape(f.satellite)}, {f.when_local}{frp}.{more}\n\n"
        f"⚠️ <b>How to protect yourself</b>\n{tips}\n\n{footer(country)}\n\nTo stop receiving alerts and delete your data: /stop"
    )


def firefighter_alert(name: str, city: str, state: str, fires: list[tuple[Fire, str]], test: bool = False, country: str | None = None) -> str:
    head = "🧪 <b>TEST ALERT (simulated)</b>\n\n" if test else "🚒 <b>Operational alert — Astross</b>\n\n"
    lines = []
    for i, (f, place) in enumerate(fires[:10], 1):
        frp = f", {f.frp:.0f} MW" if f.frp is not None else ""
        lines.append(f"{i}. <b>{escape(place)}</b> — {f.lat:.4f}, {f.lon:.4f}\n"
                     f"   {escape(f.satellite)}, {f.when_local}, confidence {f.confidence}{frp}\n"
                     f"   <a href=\"{escape(maps_link(f.lat, f.lon))}\">Google Maps</a> · "
                     f"<a href=\"{escape(fire_link(f, place))}\">Astross</a>")
    extra = f"\n… and {len(fires) - 10} more hotspot(s)." if len(fires) > 10 else ""
    return (f"{head}{escape(name.split()[0])}, {len(fires)} new heat hotspot(s) in the area of "
            f"<b>{escape(city)}{(' (' + escape(state) + ')') if state else ''}</b>:\n\n" + "\n\n".join(lines) + extra +
            f"\n\n{footer(country)}\n\nTo stop receiving alerts: /stop")


def welcome(kind: str, name: str, city: str | None, radius_km: float) -> str:
    first = escape(name.split()[0])
    if kind == "bombeiro":
        area = f"in the municipality of <b>{escape(city or '')}</b>"
    else:
        area = f"within <b>{radius_km:.0f} km</b> of your registered address"
    return (f"✅ All set, {first}! Your Telegram is connected to Astross alerts.\n\n"
            f"You will be notified when NASA satellites detect heat hotspots {area}. "
            f"Checks run every few minutes using near-real-time data.\n\n"
            "Commands: /test (simulated alert) · /status · /stop (cancel and delete your data)")
