"""Database access for alert recipients and the sent-alert log (SQLAlchemy Core, any backend)."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import delete, insert, select, update

from etl.load import db
from etl.load.schema import alert_log, alert_recipients

_ready = [False]


def _engine():
    if not _ready[0]:
        alert_recipients.create(db.engine(), checkfirst=True)
        alert_log.create(db.engine(), checkfirst=True)
        if db.is_postgres():
            from sqlalchemy import text
            with db.engine().begin() as c:
                for t in ("alert_recipients", "alert_log"):
                    c.execute(text(f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY"))
            with db.engine().begin() as c:      # idempotent migrations (country column, wider state)
                c.execute(text("ALTER TABLE alert_recipients ADD COLUMN IF NOT EXISTS country varchar(2)"))
                c.execute(text("ALTER TABLE alert_recipients ALTER COLUMN state TYPE varchar(80)"))
        _ready[0] = True
    return db.engine()


def reset_cache() -> None:
    _ready[0] = False


def create(kind: str, **fields) -> dict:
    now = datetime.now(timezone.utc)
    row = {"id": secrets.token_hex(8), "kind": kind, "link_token": ("c_" if kind == "cidadao" else "b_") + secrets.token_urlsafe(18),
           "created_at": now, "consent_at": now, "active": True, "guardian_consent": False, **fields}
    with _engine().begin() as c:
        c.execute(insert(alert_recipients).values(**row))
    return row


def by_token(link_token: str) -> dict | None:
    with _engine().connect() as c:
        r = c.execute(select(alert_recipients).where(alert_recipients.c.link_token == link_token)).mappings().first()
    return dict(r) if r else None


def by_chat(chat_id: int) -> list[dict]:
    with _engine().connect() as c:
        rows = c.execute(select(alert_recipients).where(alert_recipients.c.telegram_chat_id == chat_id)).mappings().all()
    return [dict(r) for r in rows]


def link_chat(link_token: str, chat_id: int) -> dict | None:
    with _engine().begin() as c:
        n = c.execute(update(alert_recipients).where(alert_recipients.c.link_token == link_token)
                      .values(telegram_chat_id=chat_id, active=True)).rowcount
    return by_token(link_token) if n else None


def active_connected() -> list[dict]:
    t = alert_recipients
    with _engine().connect() as c:
        rows = c.execute(select(t).where(t.c.active.is_(True), t.c.telegram_chat_id.is_not(None))).mappings().all()
    return [dict(r) for r in rows]


def delete_chat(chat_id: int) -> int:
    """LGPD: /parar removes the person's data and their alert history."""
    with _engine().begin() as c:
        ids = [r[0] for r in c.execute(select(alert_recipients.c.id).where(alert_recipients.c.telegram_chat_id == chat_id))]
        if ids:
            c.execute(delete(alert_log).where(alert_log.c.recipient_id.in_(ids)))
        return c.execute(delete(alert_recipients).where(alert_recipients.c.telegram_chat_id == chat_id)).rowcount


def already_sent(recipient_id: str) -> set[str]:
    with _engine().connect() as c:
        return {r[0] for r in c.execute(select(alert_log.c.fire_key).where(alert_log.c.recipient_id == recipient_id))}


def log_sent(recipient_id: str, fires, kind: str = "alerta") -> None:
    now = datetime.now(timezone.utc)
    rows = [{"recipient_id": recipient_id, "fire_key": f.key, "kind": kind, "fire_lat": f.lat, "fire_lon": f.lon, "sent_at": now}
            for f in fires]
    if rows:
        db.upsert("alert_log", pd.DataFrame(rows))
