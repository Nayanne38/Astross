"""Alert engine: one FIRMS scan for all recipients, match by distance/area, send new fires only.

Citizens: fires within `radius_km` (default 10 km) of the registered address -> one message with
the nearest new fire (+ count of the others). Firefighters: every new fire inside their municipality's
bounding box -> one operational message listing them. Each (recipient, fire) is sent at most once.
"""
from __future__ import annotations

import logging
import random

from alerts import firms_live, geo, messages, store, telegram
from alerts.firms_live import Fire

log = logging.getLogger("alerts.engine")


def area_of(r: dict) -> tuple[float, float, float, float]:
    if r["kind"] == "bombeiro" and r.get("bbox_w") is not None:
        return r["bbox_w"], r["bbox_s"], r["bbox_e"], r["bbox_n"]
    return geo.bbox_around(r["lat"], r["lon"], r["radius_km"])


def union(boxes: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float]:
    return min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)


def matches(r: dict, fires: list[Fire]) -> list[Fire]:
    if r["kind"] == "bombeiro" and r.get("bbox_w") is not None:
        w, s, e, n = area_of(r)
        return [f for f in fires if w <= f.lon <= e and s <= f.lat <= n]
    hits = [f for f in fires if geo.haversine_km(r["lat"], r["lon"], f.lat, f.lon) <= r["radius_km"]]
    return sorted(hits, key=lambda f: geo.haversine_km(r["lat"], r["lon"], f.lat, f.lon))


def compose(r: dict, fires: list[Fire], test: bool = False) -> str:
    if r["kind"] == "bombeiro":
        return messages.firefighter_alert(r["full_name"], r.get("city") or "", r.get("state") or "",
                                          [(f, geo.reverse(f.lat, f.lon)["label"]) for f in fires[:10]], test=test,
                                          country=r.get("country"))
    f = fires[0]
    return messages.citizen_alert(r["full_name"], r.get("age"), (r["lat"], r["lon"]), f,
                                  geo.reverse(f.lat, f.lon)["label"], n_more=len(fires) - 1, test=test, country=r.get("country"))


def scan(days: int = 1, send=None, fetch=None) -> dict:
    send, fetch = send or telegram.send, fetch or firms_live.fetch
    recipients = store.active_connected()
    if not recipients:
        return {"recipients": 0, "fires": 0, "sent": 0}
    fires = fetch(union([area_of(r) for r in recipients]), days)
    sent = 0
    for r in recipients:
        seen = store.already_sent(r["id"])
        new = [f for f in matches(r, fires) if f.key not in seen]
        if not new:
            continue
        try:
            send(r["telegram_chat_id"], compose(r, new))
        except telegram.TelegramError as e:
            log.warning("send to %s failed: %s", r["id"], e)
            continue
        store.log_sent(r["id"], new)
        sent += 1
    log.info("scan: %d recipients, %d fires in area, %d messages", len(recipients), len(fires), sent)
    return {"recipients": len(recipients), "fires": len(fires), "sent": sent}


def simulated_fire(r: dict) -> Fire:
    """A clearly-labelled fake detection near the recipient, for the onboarding test message."""
    from datetime import datetime, timezone
    if r["kind"] == "bombeiro":
        lat, lon = geo.offset(r["lat"], r["lon"], random.uniform(2, 6), random.uniform(0, 360))
    else:
        lat, lon = geo.offset(r["lat"], r["lon"], random.uniform(2.5, min(8.0, r["radius_km"] * 0.8)), random.uniform(0, 360))
    return Fire(lat, lon, datetime.now(timezone.utc).replace(second=0, microsecond=0), "NOAA-20 (VIIRS)", 18.0, "nominal")


def send_test(r: dict, send=None) -> str:
    send = send or telegram.send
    html = compose(r, [simulated_fire(r)], test=True)
    if r.get("telegram_chat_id"):
        send(r["telegram_chat_id"], html)
    return html
