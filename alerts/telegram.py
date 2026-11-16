"""Minimal Telegram Bot API client (httpx; no extra dependency). Token from TELEGRAM_BOT_TOKEN."""
from __future__ import annotations

import logging
import os
from functools import lru_cache

import httpx

log = logging.getLogger("alerts.telegram")


class TelegramError(RuntimeError):
    pass


def token() -> str | None:
    return os.getenv("TELEGRAM_BOT_TOKEN") or None


def _call(method: str, timeout: float = 30, **params):
    t = token()
    if not t:
        raise TelegramError("TELEGRAM_BOT_TOKEN is not configured (.env)")
    try:
        r = httpx.post(f"https://api.telegram.org/bot{t}/{method}", json=params, timeout=timeout)
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:      # never log the URL: it contains the token
        raise TelegramError(f"falha de rede no Telegram ({type(e).__name__})") from None
    if not data.get("ok"):
        raise TelegramError(f"Telegram: {data.get('description', 'erro desconhecido')}")
    return data["result"]


@lru_cache(maxsize=1)
def bot_username() -> str | None:
    if os.getenv("TELEGRAM_BOT_USERNAME"):
        return os.getenv("TELEGRAM_BOT_USERNAME").lstrip("@")
    if not token():
        return None
    try:
        return _call("getMe")["username"]
    except TelegramError as e:
        log.warning("getMe failed: %s", e)
        return None


def deep_link(link_token: str) -> str | None:
    u = bot_username()
    return f"https://t.me/{u}?start={link_token}" if u else None


def send(chat_id: int, html: str) -> None:
    _call("sendMessage", chat_id=chat_id, text=html, parse_mode="HTML", disable_web_page_preview=True)


def updates(offset: int | None, timeout: int = 25) -> list[dict]:
    """Long polling (no public URL needed, works on a laptop)."""
    t = token()
    if not t:
        raise TelegramError("TELEGRAM_BOT_TOKEN is not configured (.env)")
    try:
        r = httpx.post(f"https://api.telegram.org/bot{t}/getUpdates",
                       json={"offset": offset, "timeout": timeout, "allowed_updates": ["message"]},
                       timeout=timeout + 15)
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise TelegramError(f"falha de rede no Telegram ({type(e).__name__})") from None
    if not data.get("ok"):
        raise TelegramError(f"Telegram: {data.get('description', 'erro desconhecido')}")
    return data["result"]


def set_webhook(url: str, secret: str) -> None:
    """Point Telegram at the API (instant replies, no process to keep alive). Disables getUpdates polling."""
    _call("setWebhook", url=url, secret_token=secret, allowed_updates=["message"], drop_pending_updates=False)


def delete_webhook() -> None:
    _call("deleteWebhook", drop_pending_updates=False)
