"""Fire-alert feature: geometry, messages, matching/dedup and the registration API (offline, SQLite, mocks)."""
import importlib
from datetime import datetime, timezone

import pytest

from alerts import geo, messages
from alerts.firms_live import Fire

ARACAJU = (-10.9472, -37.0731)
ARACAJU_BBOX = (-37.18, -11.17, -37.02, -10.85)


def fire(lat, lon, minute=0):
    return Fire(lat, lon, datetime(2026, 11, 15, 16, minute, tzinfo=timezone.utc), "NOAA-20 (VIIRS)", 12.5, "nominal")


def test_geometry():
    lat, lon = geo.offset(*ARACAJU, 5, 90)                  # 5 km east
    assert geo.haversine_km(*ARACAJU, lat, lon) == pytest.approx(5, abs=0.01)
    assert geo.direction_pt(*ARACAJU, lat, lon) == "east"
    assert geo.direction_pt(*ARACAJU, *geo.offset(*ARACAJU, 3, 0)) == "north"
    assert geo.direction_pt(*ARACAJU, *geo.offset(*ARACAJU, 3, 225)) == "southwest"
    w, s, e, n = geo.bbox_around(*ARACAJU, 10)
    assert s < ARACAJU[0] < n and w < ARACAJU[1] < e
    assert geo.haversine_km(s, ARACAJU[1], n, ARACAJU[1]) == pytest.approx(20, abs=0.1)


def test_citizen_message_format():
    f = fire(*geo.offset(*ARACAJU, 4, 0))
    html = messages.citizen_alert("Maria <b>da</b> Silva", 70, ARACAJU, f, "Aracaju (SE)", n_more=2, country="BR")
    assert html.startswith("🔥")
    assert "Hello <b>Maria</b>, there is a fire hotspot near your registered location" in html
    assert "/foco?lat=" in html and "4.0 km north of your address" in html
    assert "2 more hotspot(s)" in html
    assert "Older people" in html and "193" in html and "/stop" in html
    kid = messages.citizen_alert("<script>x</script> Souza", 12, ARACAJU, f, "Aracaju (SE)", test=True)
    assert "<script>" not in kid and "TEST ALERT" in kid and "responsible adult" in kid
    assert f.when_local == "2026-11-15 16:00 UTC"


def test_firefighter_message_lists_fires():
    fires = [(fire(-10.9 - i / 100, -37.1, i), f"Ponto {i}") for i in range(12)]
    html = messages.firefighter_alert("João Lima", "Aracaju", "SE", fires)
    assert "12 new heat hotspot(s)" in html and "Aracaju (SE)" in html
    assert html.count("google.com/maps") == 10 and "and 2 more hotspot(s)" in html


@pytest.fixture()
def alerts_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "alerts.db"))
    from etl.load import db
    importlib.reload(db)
    db._engine = None
    from alerts import engine, store
    importlib.reload(store)
    importlib.reload(engine)
    monkeypatch.setattr(geo, "reverse", lambda lat, lon: {"label": "Aracaju (SE)", "city": "Aracaju", "state": "SE"})
    yield store, engine
    db.engine().dispose()
    db._engine = None


def test_matching_and_dedup(alerts_db):
    store, engine = alerts_db
    c = store.create("cidadao", full_name="Ana Souza", phone="79999990000", age=30, address="x",
                     lat=ARACAJU[0], lon=ARACAJU[1], radius_km=10.0)
    b = store.create("bombeiro", full_name="João Lima", phone="79999990001", unit="CBMSE", city="Aracaju", state="SE",
                     lat=ARACAJU[0], lon=ARACAJU[1], bbox_w=ARACAJU_BBOX[0], bbox_s=ARACAJU_BBOX[1],
                     bbox_e=ARACAJU_BBOX[2], bbox_n=ARACAJU_BBOX[3], radius_km=15.0)
    store.create("cidadao", full_name="Sem Telegram", phone="79999990002", age=40, address="y",
                 lat=ARACAJU[0], lon=ARACAJU[1], radius_km=10.0)           # never linked -> no alerts
    store.link_chat(c["link_token"], 111)
    store.link_chat(b["link_token"], 222)

    near = fire(*geo.offset(*ARACAJU, 3, 45))      # 3 km: citizen + firefighter
    edge = fire(*geo.offset(*ARACAJU, 12, 180))    # 12 km south: outside 10 km, inside the city box
    far = fire(-12.97, -38.50)                     # Salvador: nobody
    sent = []
    fetch_calls = []

    def fetch(bbox, days):
        fetch_calls.append(bbox)
        return [far, edge, near]

    out = engine.scan(send=lambda chat, html: sent.append((chat, html)), fetch=fetch)
    assert out == {"recipients": 2, "fires": 3, "sent": 2}
    assert len(fetch_calls) == 1                   # one FIRMS request for everybody
    by_chat = dict(sent)
    assert "Hello <b>Ana</b>" in by_chat[111] and "3.0 km northeast" in by_chat[111]
    assert "2 new heat hotspot(s)" in by_chat[222]

    sent.clear()                                   # same fires again -> nothing new
    assert engine.scan(send=lambda chat, html: sent.append(chat), fetch=fetch)["sent"] == 0

    newer = fire(*geo.offset(*ARACAJU, 1, 0), minute=30)
    engine.scan(send=lambda chat, html: sent.append(chat), fetch=lambda bbox, days: [near, newer])
    assert sorted(sent) == [111, 222]

    assert store.delete_chat(111) == 1             # /parar removes the person and their history
    assert store.by_token(c["link_token"]) is None and store.already_sent(c["id"]) == set()


@pytest.fixture()
def api_client(alerts_db, monkeypatch):
    from alerts import telegram
    from api import alerts as alerts_api
    importlib.reload(alerts_api)
    monkeypatch.setattr(telegram, "bot_username", lambda: "astross_teste_bot")
    monkeypatch.setattr(telegram, "token", lambda: "x")
    monkeypatch.setattr(geo, "geocode_city", lambda city, uf="", country="": {
        "city": "Aracaju", "state": "SE", "lat": ARACAJU[0], "lon": ARACAJU[1], "bbox": ARACAJU_BBOX})
    sent = []
    monkeypatch.setattr(telegram, "send", lambda chat, html: sent.append((chat, html)))
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    app = FastAPI()
    app.include_router(alerts_api.router)
    return TestClient(app), alerts_db[0], sent


CITIZEN = {"full_name": "Maria da Silva", "phone": "+55 (79) 99999-0000", "age": 34, "address": "Av. Beira Mar, Aracaju",
           "lat": ARACAJU[0], "lon": ARACAJU[1], "consent": True}


def test_api_citizen_flow(api_client):
    client, store, sent = api_client
    assert client.get("/alerts/config").json()["bot_username"] == "astross_teste_bot"
    r = client.post("/alerts/citizens", json=CITIZEN)
    assert r.status_code == 201, r.text
    reg = r.json()
    assert reg["first_name"] == "Maria" and reg["radius_km"] == 10 and not reg["connected"]
    assert reg["telegram_link"] == f"https://t.me/astross_teste_bot?start={reg['link_token']}"
    assert "Hello <b>Maria</b>" in reg["preview_html"] and "TEST" in reg["preview_html"]

    tok = reg["link_token"]
    assert client.post(f"/alerts/registration/{tok}/test").status_code == 409      # not linked yet
    store.link_chat(tok, 555)
    assert client.get(f"/alerts/registration/{tok}").json()["connected"] is True
    assert client.post(f"/alerts/registration/{tok}/test").json() == {"sent": True}
    assert sent[-1][0] == 555
    assert client.get("/alerts/registration/nao-existe").status_code == 404


def test_api_citizen_validation(api_client):
    client, _, _ = api_client
    assert client.post("/alerts/citizens", json={**CITIZEN, "consent": False}).status_code == 422
    assert client.post("/alerts/citizens", json={**CITIZEN, "full_name": "Maria"}).status_code == 422
    assert client.post("/alerts/citizens", json={**CITIZEN, "phone": "123"}).status_code == 422
    assert client.post("/alerts/citizens", json={**CITIZEN, "lat": 48.85, "lon": 2.35}).status_code == 201   # anywhere in the world
    minor = {**CITIZEN, "age": 15}
    assert client.post("/alerts/citizens", json=minor).status_code == 422
    assert client.post("/alerts/citizens", json={**minor, "guardian_consent": True}).status_code == 201


def test_api_firefighter(api_client):
    client, _, _ = api_client
    body = {"full_name": "João Pereira Lima", "phone": "+55 79 98888-0000", "unit": "CBMSE 1º GBM", "city": "aracaju",
            "state": "SE", "country": "br", "consent": True}
    r = client.post("/alerts/firefighters", json=body)
    assert r.status_code == 201, r.text
    reg = r.json()
    assert reg["kind"] == "bombeiro" and reg["city"] == "Aracaju" and reg["state"] == "SE"
    assert reg["area"] == list(ARACAJU_BBOX)
    assert "Aracaju (SE)" in reg["preview_html"]
    assert client.post("/alerts/firefighters", json={**body, "country": "BRA"}).status_code == 422
