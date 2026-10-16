"""Connections: tools mentioned in the recording, a calendar feed, and outgoing webhooks."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import threading
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import select

from ..db import AppWebhook, GeneratedApp, MediaAsset, Project, Record, SessionLocal, WorkflowVersion, utcnow

log = logging.getLogger("cyr.integrations")

# Tools a small business typically mentions. "status" says what this build actually offers.
CATALOG: list[dict[str, Any]] = [
    {"id": "spreadsheet", "name": "Excel / Google Sheets", "keywords": ["excel", "spreadsheet", "google sheet", "táblázat", "sheets"], "status": "available", "via": "CSV export per list and the full ZIP download"},
    {"id": "calendar", "name": "Google Calendar / Outlook", "keywords": ["calendar", "naptár", "outlook", "appointment", "időpont", "booking"], "status": "available", "via": "Calendar subscription link (ICS) with every date in your app"},
    {"id": "webhook", "name": "Zapier / Make / your own systems", "keywords": ["zapier", "make.com", "integromat", "api", "webhook", "n8n"], "status": "available", "via": "Webhooks: every change is sent to your URL"},
    {"id": "invoicing", "name": "Számlázz.hu / Billingo invoicing", "keywords": ["invoice", "számla", "billingo", "számlázz", "receipt", "nyugta", "deposit", "kaució"], "status": "planned", "via": "Planned: create an invoice when a record changes state"},
    {"id": "email", "name": "Email notifications", "keywords": ["email", "e-mail", "mail", "levél"], "status": "planned", "via": "Planned: send an email on chosen events"},
    {"id": "messaging", "name": "SMS / WhatsApp reminders", "keywords": ["sms", "whatsapp", "text message", "phone number", "telefonszám", "call them"], "status": "planned", "via": "Planned: remind customers before a due date"},
    {"id": "webshop", "name": "Shopify / WooCommerce", "keywords": ["shopify", "woocommerce", "webshop", "online shop", "webáruház"], "status": "planned", "via": "Planned: sync products and orders"},
]


def _sources(s, app: GeneratedApp) -> list[dict[str, Any]]:
    """Searchable text with its origin: transcript segments (with times), narration, workflow text."""
    out: list[dict[str, Any]] = []
    project = s.get(Project, app.project_id)
    media = s.scalars(select(MediaAsset).where(MediaAsset.project_id == app.project_id).order_by(MediaAsset.created_at.desc())).first()
    for seg in (media.transcript if media and media.transcript else []):
        out.append({"text": seg["text"], "start": seg.get("start"), "kind": "transcript"})
    if project and project.narration:
        for line in re.split(r"(?<=[.!?])\s+|\n+", project.narration):
            if line.strip():
                out.append({"text": line.strip(), "start": None, "kind": "narration"})
    wv = s.get(WorkflowVersion, app.workflow_version_id)
    if wv:
        for r in wv.definition.get("rules", []):
            out.append({"text": r.get("statement", ""), "start": None, "kind": "workflow"})
        for e in wv.definition.get("entities", []):
            out.append({"text": " ".join([e.get("label", "")] + [f.get("label", "") for f in e.get("fields", [])]), "start": None, "kind": "workflow"})
    return out


def detect(s, app: GeneratedApp) -> list[dict[str, Any]]:
    sources = _sources(s, app)
    found = []
    for tool in CATALOG:
        hit = None
        for src in sources:
            low = src["text"].lower()
            if any(re.search(rf"\b{re.escape(k)}", low) for k in tool["keywords"]):
                if hit is None or (hit["kind"] != "transcript" and src["kind"] == "transcript"):
                    hit = src
        found.append({**{k: v for k, v in tool.items() if k != "keywords"}, "mentioned": hit is not None, "evidence": {"quote": hit["text"][:200], "start": hit["start"], "kind": hit["kind"]} if hit else None})
    found.sort(key=lambda t: (not t["mentioned"], t["status"] != "available"))
    return found


# --- calendar -----------------------------------------------------------------------------------


def _ics_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def calendar_ics(s, app: GeneratedApp, title_of, code_of) -> str:
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Integrint//Code Your Reality//EN", "CALSCALE:GREGORIAN", f"X-WR-CALNAME:{_ics_escape(app.name)}"]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for e in app.manifest["entities"]:
        date_fields = [f for f in e["fields"] if f["type"] == "date"]
        if not date_fields:
            continue
        for rec in s.scalars(select(Record).where(Record.app_id == app.id, Record.entity == e["key"])):
            for f in date_fields:
                value = rec.data.get(f["key"])
                try:
                    d = date.fromisoformat(str(value))
                except (TypeError, ValueError):
                    continue
                lines += [
                    "BEGIN:VEVENT",
                    f"UID:{rec.id}-{f['key']}@code-your-reality",
                    f"DTSTAMP:{stamp}",
                    f"DTSTART;VALUE=DATE:{d.strftime('%Y%m%d')}",
                    f"SUMMARY:{_ics_escape(f'{f['label']}: {title_of(rec)} ({code_of(rec)})')}",
                    "END:VEVENT",
                ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


# --- webhooks -----------------------------------------------------------------------------------


def valid_webhook_url(url: str) -> bool:
    p = urlparse(url)
    return p.scheme in ("http", "https") and bool(p.netloc) and len(url) <= 500


def dispatch(app_id: str, app_slug: str, events: list[dict[str, Any]]) -> None:
    """Send events to every active webhook of the app, in the background, signed with HMAC-SHA256."""
    if not events:
        return

    def run() -> None:
        with SessionLocal() as s:
            hooks = list(s.scalars(select(AppWebhook).where(AppWebhook.app_id == app_id, AppWebhook.active.is_(True))))
            for hook in hooks:
                for ev in events:
                    status = send(hook, {"app": app_slug, "event": ev, "sent_at": datetime.now(timezone.utc).isoformat()})
                hook.last_status = status
                hook.last_sent_at = utcnow()
            s.commit()

    if events:
        threading.Thread(target=run, daemon=True).start()


def send(hook: AppWebhook, payload: dict[str, Any]) -> str:
    body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
    sig = hmac.new(hook.secret.encode(), body, hashlib.sha256).hexdigest()
    try:
        r = httpx.post(hook.url, content=body, headers={"Content-Type": "application/json", "X-CYR-Signature": f"sha256={sig}", "User-Agent": "CodeYourReality-Webhook/1.0"}, timeout=5, follow_redirects=False)
        return f"{r.status_code}"
    except httpx.HTTPError as exc:
        return f"error: {type(exc).__name__}"
