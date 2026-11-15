"""Fire-alert registration API (used by the PWA pages /alertas and /bombeiros).

Flow: the app registers the person -> gets a one-time link token -> shows a QR code / button that opens
the Telegram bot with /start <token> -> the bot links the chat and sends a welcome + simulated alert.
"""
from __future__ import annotations

import re
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from alerts import engine, geo, store, telegram

router = APIRouter(prefix="/alerts", tags=["alertas"])
CITIZEN_RADIUS_KM = 10.0
PHONE = re.compile(r"^\+[1-9]\d{6,14}$")


class CitizenIn(BaseModel):
    full_name: str = Field(min_length=5, max_length=120)
    phone: str = Field(max_length=32)
    age: int = Field(ge=1, le=120)
    address: str = Field(min_length=5, max_length=300)
    lat: float = Field(ge=-90, le=90, description="confirmed on the map")
    lon: float = Field(ge=-180, le=180)
    consent: bool
    guardian_consent: bool = False

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v.split()) < 2:
            raise ValueError("enter the full name (first and last name)")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = re.sub(r"[\s().-]", "", v.strip())
        if not PHONE.match(v):
            raise ValueError("invalid phone number: use the international format with country code, e.g. +55 79 99999-0000")
        return v


class FirefighterIn(BaseModel):
    full_name: str = Field(min_length=5, max_length=120)
    phone: str = Field(max_length=32)
    unit: str = Field(min_length=2, max_length=120, description="corps / battalion / station")
    city: str = Field(min_length=2, max_length=80)
    state: str = Field("", max_length=80, description="state / province / region (optional)")
    country: str = Field(min_length=2, max_length=2, description="ISO 3166-1 alpha-2")
    consent: bool

    _name = field_validator("full_name")(CitizenIn._name.__func__)
    _phone = field_validator("phone")(CitizenIn._phone.__func__)

    @field_validator("country")
    @classmethod
    def _cc(cls, v: str) -> str:
        if not re.fullmatch(r"[A-Za-z]{2}", v):
            raise ValueError("invalid country code")
        return v.upper()

    @field_validator("state")
    @classmethod
    def _state(cls, v: str) -> str:
        return v.strip()


class Registration(BaseModel):
    kind: Literal["cidadao", "bombeiro"]
    first_name: str
    city: Optional[str] = None
    state: Optional[str] = None
    radius_km: float
    area: Optional[list[float]] = Field(None, description="bombeiro: [west, south, east, north]")
    link_token: str
    telegram_link: Optional[str] = Field(None, description="t.me deep link (null if the bot is not configured)")
    connected: bool
    preview_html: str = Field(description="example of the alert this person will receive (simulated)")


def _registration(r: dict, preview: str | None = None) -> Registration:
    area = [r["bbox_w"], r["bbox_s"], r["bbox_e"], r["bbox_n"]] if r.get("bbox_w") is not None else None
    return Registration(kind=r["kind"], first_name=r["full_name"].split()[0], city=r.get("city"), state=r.get("state"),
                        radius_km=r["radius_km"], area=area, link_token=r["link_token"],
                        telegram_link=telegram.deep_link(r["link_token"]), connected=r.get("telegram_chat_id") is not None,
                        preview_html=preview or engine.compose(r, [engine.simulated_fire(r)], test=True))


@router.get("/config")
def config():
    return {"bot_username": telegram.bot_username(), "bot_enabled": telegram.token() is not None,
            "citizen_radius_km": CITIZEN_RADIUS_KM}


@router.get("/geocode")
def geocode(q: str = Query(min_length=4, max_length=300), country: Optional[str] = Query(None, min_length=2, max_length=2)):
    try:
        return list(geo.geocode(q.strip(), country=country))
    except httpx.HTTPError:
        raise HTTPException(503, "Address service unavailable; mark the location on the map.")


@router.get("/reverse")
def reverse(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180)):
    return geo.reverse(round(lat, 4), round(lon, 4))


@router.post("/citizens", response_model=Registration, status_code=201)
def register_citizen(body: CitizenIn):
    if not body.consent:
        raise HTTPException(422, "You must accept the use of your data to receive alerts.")
    if body.age < 18 and not body.guardian_consent:
        raise HTTPException(422, "Under-18s need a guardian's authorization.")
    place = geo.reverse(round(body.lat, 4), round(body.lon, 4))
    r = store.create("cidadao", full_name=body.full_name, phone=body.phone, age=body.age, address=body.address,
                     lat=body.lat, lon=body.lon, city=place.get("city"), state=place.get("state"), country=place.get("country"),
                     radius_km=CITIZEN_RADIUS_KM, guardian_consent=body.guardian_consent)
    return _registration(r)


@router.post("/firefighters", response_model=Registration, status_code=201)
def register_firefighter(body: FirefighterIn):
    if not body.consent:
        raise HTTPException(422, "You must accept the use of your data to receive alerts.")
    try:
        c = geo.geocode_city(body.city.strip(), body.state, body.country)
    except httpx.HTTPError:
        raise HTTPException(503, "Location service unavailable; please try again.")
    if not c:
        raise HTTPException(404, f"Place '{body.city}{', ' + body.state if body.state else ''}' not found in {body.country}.")
    w, s, e, n = c["bbox"]
    r = store.create("bombeiro", full_name=body.full_name, phone=body.phone, unit=body.unit, city=c["city"],
                     state=c["state"], country=body.country, lat=c["lat"], lon=c["lon"], bbox_w=w, bbox_s=s, bbox_e=e, bbox_n=n,
                     radius_km=round(geo.haversine_km(s, w, n, e) / 2, 1))
    return _registration(r)


@router.get("/registration/{token}", response_model=Registration)
def registration(token: str):
    r = store.by_token(token)
    if not r:
        raise HTTPException(404, "Registration not found.")
    return _registration(r)


@router.post("/registration/{token}/test")
def send_test(token: str):
    r = store.by_token(token)
    if not r:
        raise HTTPException(404, "Registration not found.")
    if r.get("telegram_chat_id") is None:
        raise HTTPException(409, "Connect Telegram first (scan the QR code).")
    try:
        engine.send_test(r)
    except telegram.TelegramError as e:
        raise HTTPException(503, str(e))
    return {"sent": True}
