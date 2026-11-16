"""Register / remove the Telegram webhook.

  python -m alerts.webhook set https://firetrack-api.vercel.app/telegram/webhook
  python -m alerts.webhook delete        (go back to local polling: python tasks.py bot)
Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in the environment/.env.
"""
import os
import sys

from alerts import telegram

if __name__ == "__main__":
    from etl import config  # noqa: F401  (loads .env)
    if sys.argv[1:2] == ["set"] and len(sys.argv) == 3:
        secret = os.getenv("TELEGRAM_WEBHOOK_SECRET")
        if not secret:
            raise SystemExit("TELEGRAM_WEBHOOK_SECRET is not set")
        telegram.set_webhook(sys.argv[2], secret)
        print("webhook set")
    elif sys.argv[1:2] == ["delete"]:
        telegram.delete_webhook()
        print("webhook removed")
    else:
        raise SystemExit(__doc__)
