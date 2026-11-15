"""Telegram bot process: answers commands (long polling) and runs the FIRMS alert scan periodically.

Run: python tasks.py bot      (needs TELEGRAM_BOT_TOKEN and FIRMS_MAP_KEY in .env)

Commands: /start <token> (link the registration made in the app), /teste or /test (simulated alert),
          /status, /parar or /stop (cancel and delete the person's data — LGPD).
"""
from __future__ import annotations

import logging
import os
import time

from alerts import engine, messages, store, telegram

log = logging.getLogger("alerts.bot")
INTERVAL_MIN = float(os.getenv("ALERT_INTERVAL_MIN", "15"))

HELP = ("👋 This is the <b>Astross</b> fire alert bot (NASA satellite data).\n\n"
        "To receive alerts, sign up in the app and tap <b>Connect to Telegram</b> "
        f"(or scan the QR code):\n{messages.app_url()}/alertas\n\n"
        "Commands: /test · /status · /stop")


def handle(msg: dict) -> None:
    chat = msg.get("chat", {}).get("id")
    text = (msg.get("text") or "").strip()
    if not chat or not text.startswith("/"):
        if chat:
            telegram.send(chat, HELP)
        return
    cmd, _, arg = text.partition(" ")
    cmd = cmd.split("@")[0].lower()
    if cmd == "/start":
        r = store.link_chat(arg.strip(), chat) if arg.strip() else None
        if not r:
            telegram.send(chat, HELP if not arg else "I could not find that registration. Generate a new QR code in the app.\n\n" + HELP)
            return
        telegram.send(chat, messages.welcome(r["kind"], r["full_name"], r.get("city"), r["radius_km"]))
        engine.send_test(r)                         # the simulated alert, so the person sees the format
    elif cmd in ("/teste", "/test"):
        rows = store.by_chat(chat)
        if not rows:
            telegram.send(chat, HELP); return
        for r in rows:
            engine.send_test(r)
    elif cmd == "/status":
        rows = store.by_chat(chat)
        if not rows:
            telegram.send(chat, "No active registration on this Telegram.\n\n" + HELP); return
        lines = [f"• {'Firefighter' if r['kind'] == 'bombeiro' else 'Resident'}: {r['full_name']} — "
                 + (f"{r.get('city')}{' (' + r['state'] + ')' if r.get('state') else ''}" if r["kind"] == "bombeiro" else f"{r['radius_km']:.0f} km radius around the address")
                 for r in rows]
        telegram.send(chat, "📋 <b>Your registrations</b>\n" + "\n".join(lines) + f"\n\nChecked every {INTERVAL_MIN:.0f} min.")
    elif cmd in ("/parar", "/stop"):
        n = store.delete_chat(chat)
        telegram.send(chat, "🗑️ Done: you will no longer receive alerts and your data has been deleted." if n
                      else "There was no registration on this Telegram.")
    else:
        telegram.send(chat, HELP)


def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if not telegram.token():
        raise SystemExit("TELEGRAM_BOT_TOKEN is not configured. Create the bot with @BotFather and add it to .env.")
    log.info("bot @%s online; alert scan every %.0f min", telegram.bot_username(), INTERVAL_MIN)
    offset, next_scan = None, 0.0
    while True:
        if time.time() >= next_scan:
            try:
                engine.scan()
            except Exception as e:                  # keep the bot alive; report and retry next cycle
                log.exception("scan failed: %s", e)
            next_scan = time.time() + INTERVAL_MIN * 60
        try:
            for u in telegram.updates(offset, timeout=20):
                offset = u["update_id"] + 1
                if "message" in u:
                    try:
                        handle(u["message"])
                    except Exception:
                        log.exception("failed to handle update %s", u.get("update_id"))
        except telegram.TelegramError as e:
            log.warning("%s — retrying in 5 s", e)
            time.sleep(5)


if __name__ == "__main__":
    run()
