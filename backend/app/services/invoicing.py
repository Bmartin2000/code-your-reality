"""Invoices: totals, numbering, drafts, and issuing through the Számlázz.hu Agent.

Two scopes share this code:
- "platform": Code Your Reality's own subscription invoices (Plus/Business), configured by the
  founding admin. A paid plan gets one invoice per monthly period, created automatically.
- an app id: a business invoicing its own customers from its generated app (Plus).

Until a scope is connected to Számlázz.hu, invoices stay **drafts**: they show what will be
invoiced but are not valid invoices (in Hungary an invoice must be issued by invoicing software
that reports it to the tax authority). With a connection and auto-issue on, new invoices are issued
right away and Számlázz.hu emails them to the buyer.

The XML follows the public Számla Agent format (xmlszamla). Verify the setup once with a free
Számlázz.hu test account before using a live key.
"""

from __future__ import annotations

import logging
from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from urllib.parse import unquote_plus
from xml.sax.saxutils import escape

import httpx
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import Account, BillingProfile, Invoice, InvoicingConfig, utcnow
from . import plans

log = logging.getLogger(__name__)

PLATFORM = "platform"
SZAMLAZZ_URL = "https://www.szamlazz.hu/szamla/"
CURRENCIES = ("HUF", "EUR", "USD")
VAT_RATES = ("27", "18", "5", "0", "AAM", "TAM", "EU", "EUK", "MAA", "F.AFA", "K.AFA")  # Számlázz.hu codes


class InvoicingError(Exception):
    pass


# --- configuration ---------------------------------------------------------------------------------


def config(s: Session, scope: str) -> InvoicingConfig:
    c = s.get(InvoicingConfig, scope)
    if not c:
        c = InvoicingConfig(scope=scope, currency="EUR" if scope == PLATFORM else "HUF")
        s.add(c)
        s.flush()
    return c


def connected(c: InvoicingConfig) -> bool:
    return c.provider == "szamlazz" and bool(c.agent_key)


def public_config(c: InvoicingConfig) -> dict[str, Any]:
    key = c.agent_key or ""
    return {
        "provider": c.provider,
        "connected": connected(c),
        "agent_key_set": bool(key),
        "agent_key_hint": f"…{key[-4:]}" if len(key) >= 8 else None,  # never the key itself
        "e_invoice": c.e_invoice,
        "send_email": c.send_email,
        "auto_issue": c.auto_issue,
        "language": c.language,
        "currency": c.currency,
        "vat_rate": c.vat_rate,
        "payment_days": c.payment_days,
        "note": c.note,
    }


def update_config(s: Session, scope: str, body: dict[str, Any]) -> InvoicingConfig:
    c = config(s, scope)
    for k in ("provider", "e_invoice", "send_email", "auto_issue", "language", "currency", "vat_rate", "payment_days", "note"):
        if k in body and body[k] is not None:
            setattr(c, k, body[k])
    if body.get("agent_key"):
        c.agent_key = body["agent_key"].strip()
    if body.get("remove_agent_key"):
        c.agent_key = None
    if c.provider == "szamlazz" and not c.agent_key:
        raise HTTPException(400, {"message": "Add your Számla Agent key to connect Számlázz.hu.", "field_errors": {"agent_key": "Required to connect."}})
    s.commit()
    return c


# --- money -------------------------------------------------------------------------------------------


def _q(currency: str) -> Decimal:
    return Decimal("1") if currency == "HUF" else Decimal("0.01")


def _dec(v: Any) -> Decimal:
    try:
        return Decimal(str(v).replace(",", ".").replace(" ", ""))
    except (InvalidOperation, ValueError):
        raise HTTPException(422, {"message": f"“{v}” is not a number."}) from None


def compute(items: list[dict[str, Any]], currency: str) -> tuple[list[dict[str, Any]], Decimal, Decimal, Decimal]:
    """Line totals and invoice totals. VAT is calculated per line on the net value."""
    q = _q(currency)
    out, net, vat = [], Decimal(0), Decimal(0)
    for it in items:
        qty = _dec(it.get("quantity", 1))
        unit_price = _dec(it.get("unit_price", 0))
        if qty <= 0 or unit_price < 0:
            raise HTTPException(422, {"message": "Quantities must be positive and prices can't be negative."})
        rate = str(it.get("vat_rate") or "27")
        if rate not in VAT_RATES:
            raise HTTPException(422, {"message": f"Unknown VAT rate: {rate}."})
        line_net = (qty * unit_price).quantize(q, ROUND_HALF_UP)
        line_vat = (line_net * Decimal(rate) / 100).quantize(q, ROUND_HALF_UP) if rate.isdigit() else Decimal(0)
        out.append({
            "name": str(it.get("name", "")).strip()[:200] or "Item",
            "quantity": str(qty.normalize()),
            "unit": str(it.get("unit") or "db")[:20],
            "unit_price": str(unit_price.quantize(q, ROUND_HALF_UP)),
            "vat_rate": rate,
            "net": str(line_net),
            "vat": str(line_vat),
            "gross": str(line_net + line_vat),
        })
        net += line_net
        vat += line_vat
    if not out:
        raise HTTPException(422, {"message": "Add at least one line."})
    return out, net, vat, net + vat


# --- creating and issuing ----------------------------------------------------------------------------


def _next_seq(s: Session, scope: str) -> int:
    return (s.scalar(select(func.max(Invoice.seq)).where(Invoice.scope == scope)) or 0) + 1


def create(
    s: Session,
    scope: str,
    *,
    kind: str,
    buyer: dict[str, Any],
    items: list[dict[str, Any]],
    issue_date: date | None = None,
    record_id: str | None = None,
    period: tuple[date, date] | None = None,
    note: str = "",
) -> Invoice:
    c = config(s, scope)
    lines, net, vat, gross = compute(items, c.currency)
    issued = issue_date or datetime.now(timezone.utc).date()
    inv = Invoice(
        scope=scope,
        kind=kind,
        seq=_next_seq(s, scope),
        record_id=record_id,
        buyer=buyer,
        items=lines,
        currency=c.currency,
        net=str(net),
        vat=str(vat),
        gross=str(gross),
        issue_date=issued.isoformat(),
        due_date=(issued + timedelta(days=c.payment_days)).isoformat(),
        period_start=period[0].isoformat() if period else None,
        period_end=period[1].isoformat() if period else None,
        note=(note or c.note or "")[:500],
    )
    s.add(inv)
    s.flush()
    if connected(c) and c.auto_issue:
        issue(s, inv)
    return inv


def issue(s: Session, inv: Invoice) -> Invoice:
    """Issue a draft through Számlázz.hu. On failure the invoice stays a draft with the reason."""
    if inv.status == "issued":
        return inv
    c = config(s, inv.scope)
    if not connected(c):
        raise HTTPException(409, {"message": "Connect Számlázz.hu first: invoices stay drafts until then.", "invoicing": True})
    missing = [label for key, label in (("name", "name"), ("postcode", "postcode"), ("city", "city"), ("address", "address")) if not str(inv.buyer.get(key) or "").strip()]
    if missing:
        inv.status = "failed"
        inv.error = f"The buyer's {', '.join(missing)} is missing. Complete the billing details and issue it again."
        s.commit()
        return inv
    try:
        number, pdf = send_to_szamlazz(build_xml(c, inv), timeout=20)
    except InvoicingError as exc:
        inv.status = "failed"
        inv.error = str(exc)
        s.commit()
        log.warning("Invoice %s could not be issued: %s", inv.id, exc)
        return inv
    inv.status = "issued"
    inv.number = number
    inv.error = None
    inv.issued_at = utcnow()
    if pdf:
        folder = get_settings().data_dir / "invoices"
        folder.mkdir(parents=True, exist_ok=True)
        inv.pdf_name = f"{inv.id}.pdf"
        (folder / inv.pdf_name).write_bytes(pdf)
    s.commit()
    return inv


def pdf_path(inv: Invoice) -> Path | None:
    if not inv.pdf_name:
        return None
    p = get_settings().data_dir / "invoices" / inv.pdf_name
    return p if p.is_file() else None


def public(inv: Invoice) -> dict[str, Any]:
    return {
        "id": inv.id,
        "kind": inv.kind,
        "draft_number": f"DRAFT-{inv.seq:04d}",
        "number": inv.number,
        "status": inv.status,
        "error": inv.error,
        "record_id": inv.record_id,
        "buyer": inv.buyer,
        "items": inv.items,
        "currency": inv.currency,
        "net": inv.net,
        "vat": inv.vat,
        "gross": inv.gross,
        "issue_date": inv.issue_date,
        "due_date": inv.due_date,
        "period_start": inv.period_start,
        "period_end": inv.period_end,
        "note": inv.note,
        "has_pdf": bool(inv.pdf_name),
        "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
        "issued_at": inv.issued_at.isoformat() if inv.issued_at else None,
        "created_at": inv.created_at.isoformat(),
    }


def list_for(s: Session, scope: str, limit: int = 200) -> list[Invoice]:
    return list(s.scalars(select(Invoice).where(Invoice.scope == scope).order_by(Invoice.seq.desc()).limit(limit)))


# --- Számlázz.hu Agent ---------------------------------------------------------------------------------


def _x(tag: str, value: Any) -> str:
    if isinstance(value, bool):
        value = "true" if value else "false"
    return f"<{tag}>{escape(str(value))}</{tag}>"


def build_xml(c: InvoicingConfig, inv: Invoice) -> str:
    b = inv.buyer
    lines = "".join(
        "<tetel>"
        + _x("megnevezes", it["name"])
        + _x("mennyiseg", it["quantity"])
        + _x("mennyisegiEgyseg", it["unit"])
        + _x("nettoEgysegar", it["unit_price"])
        + _x("afakulcs", it["vat_rate"])
        + _x("nettoErtek", it["net"])
        + _x("afaErtek", it["vat"])
        + _x("bruttoErtek", it["gross"])
        + "</tetel>"
        for it in inv.items
    )
    order = f"CYR-{inv.scope[:8]}-{inv.seq:04d}" if inv.scope != PLATFORM else f"CYR-SUB-{inv.seq:04d}"
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">'
        "<beallitasok>"
        + _x("szamlaagentkulcs", c.agent_key or "")
        + _x("eszamla", c.e_invoice)
        + _x("szamlaLetoltes", True)
        + _x("valaszVerzio", 1)
        + "</beallitasok>"
        "<fejlec>"
        + _x("keltDatum", inv.issue_date)
        + _x("teljesitesDatum", inv.period_start or inv.issue_date)
        + _x("fizetesiHataridoDatum", inv.due_date)
        + _x("fizmod", "Átutalás")
        + _x("penznem", inv.currency)
        + _x("szamlaNyelve", c.language)
        + _x("megjegyzes", inv.note)
        + (_x("arfolyamBank", "MNB") + _x("arfolyam", 0) if inv.currency != "HUF" else "")
        + _x("rendelesSzam", order)
        + _x("elolegszamla", False)
        + _x("vegszamla", False)
        + _x("helyesbitoszamla", False)
        + _x("dijbekero", False)
        + "</fejlec>"
        "<elado></elado>"
        "<vevo>"
        + _x("nev", b.get("name", ""))
        + _x("irsz", b.get("postcode", ""))
        + _x("telepules", b.get("city", ""))
        + _x("cim", b.get("address", ""))
        + _x("email", b.get("email", ""))
        + _x("sendEmail", bool(c.send_email and b.get("email")))
        + _x("adoszam", b.get("tax_number", ""))
        + "</vevo>"
        "<tetelek>" + lines + "</tetelek>"
        "</xmlszamla>"
    )


def send_to_szamlazz(xml: str, timeout: float = 20) -> tuple[str, bytes | None]:
    """POST the Agent XML. Returns (invoice number, PDF bytes) or raises InvoicingError with the reason."""
    try:
        r = httpx.post(SZAMLAZZ_URL, files={"action-xmlagentxmlfile": ("invoice.xml", xml.encode("utf-8"), "text/xml")}, timeout=timeout)
    except httpx.HTTPError as exc:
        raise InvoicingError(f"Számlázz.hu could not be reached ({exc.__class__.__name__}). Try again later.") from exc
    error = r.headers.get("szlahu_error")
    code = r.headers.get("szlahu_error_code")
    if error or code:
        raise InvoicingError(f"Számlázz.hu refused the invoice{f' (code {code})' if code else ''}: {unquote_plus(error or '')}".strip())
    number = r.headers.get("szlahu_szamlaszam")
    if r.status_code >= 400 or not number:
        raise InvoicingError(f"Unexpected answer from Számlázz.hu (HTTP {r.status_code}).")
    pdf = r.content if r.content[:4] == b"%PDF" else None
    return number, pdf


# --- subscription invoices ------------------------------------------------------------------------------


def _add_month(d: date) -> date:
    y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return d.replace(year=y, month=m, day=min(d.day, monthrange(y, m)[1]))


def billing_address(s: Session) -> dict[str, str]:
    prof = s.get(BillingProfile, "default")
    keys = ("country", "postcode", "city", "address", "tax_number")
    out = {k: (getattr(prof, k) or "") if prof else "" for k in keys}
    out["country"] = out["country"] or "Magyarország"
    return out


def subscriber_buyer(s: Session) -> dict[str, Any]:
    acc = plans.account(s)
    return {"name": acc.company, "email": acc.billing_email, **billing_address(s)}


def periods(start: date, today: date) -> list[tuple[date, date]]:
    out, p = [], start
    while p <= today:
        nxt = _add_month(p)
        out.append((p, nxt - timedelta(days=1)))
        p = nxt
    return out


def ensure_subscription_invoices(s: Session) -> list[Invoice]:
    """One invoice per monthly period of a paid plan, created when the period starts (renewals
    included). Uses the real plan: Subscription Test Mode never creates invoices."""
    acc: Account = plans.account(s)
    plan = plans.PLANS.get(acc.plan)
    if not plan or not plan.price_eur or not acc.plan_started_at:
        return []
    start = acc.plan_started_at.date()
    have = {i.period_start for i in s.scalars(select(Invoice).where(Invoice.scope == PLATFORM, Invoice.kind == "subscription"))}
    created = []
    c = config(s, PLATFORM)
    for p_start, p_end in periods(start, datetime.now(timezone.utc).date()):
        if p_start.isoformat() in have:
            continue
        price = Decimal(plan.price_eur)
        if c.currency != "EUR":
            # Prices are set in EUR; another invoice currency needs an explicit price list.
            raise HTTPException(409, {"message": "Subscription prices are in EUR. Set the invoice currency to EUR in Invoicing settings."})
        created.append(
            create(
                s,
                PLATFORM,
                kind="subscription",
                buyer=subscriber_buyer(s),
                items=[{"name": f"Code Your Reality {plan.name} – {p_start.isoformat()} – {p_end.isoformat()}", "quantity": 1, "unit": "hó", "unit_price": price, "vat_rate": c.vat_rate}],
                period=(p_start, p_end),  # issued today; the period is the performance date
            )
        )
    s.commit()
    return created
