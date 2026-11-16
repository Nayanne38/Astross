"""Telegram webhook: the bot's command handling as an HTTP endpoint (serverless, no always-on process).

Register once with:  python -m alerts.webhook set https://<api-host>/telegram/webhook
Telegram sends the secret in X-Telegram-Bot-Api-Secret-Token; anything without it is refused.
"""
from __future__ import annotations

import hmac
import logging
import os

from fastapi import APIRouter, Header, HTTPException, Request

log = logging.getLogger("api.telegram_hook")
router = APIRouter()


@router.post("/telegram/webhook", include_in_schema=False)
async def telegram_webhook(request: Request, x_telegram_bot_api_secret_token: str | None = Header(default=None)):
    secret = os.getenv("TELEGRAM_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(503, "webhook not configured")
    if not x_telegram_bot_api_secret_token or not hmac.compare_digest(x_telegram_bot_api_secret_token, secret):
        raise HTTPException(403, "forbidden")
    update = await request.json()
    msg = update.get("message") if isinstance(update, dict) else None
    if msg:
        from starlette.concurrency import run_in_threadpool
        from alerts import bot
        try:
            await run_in_threadpool(bot.handle, msg)
        except Exception:                       # always 200: Telegram would otherwise retry the same update forever
            log.exception("failed to handle update %s", update.get("update_id"))
    return {"ok": True}
