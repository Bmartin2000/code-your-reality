"""The workspace's plan and billing.

Everyone signed in can read the plan. Only the founding admin (the account that created the
workspace) can change it and see billing: plan changes, demo checkouts and billing details.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from datetime import timedelta
from decimal import Decimal

from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import BillingEvent, BillingProfile, Invoice, User, get_session, utcnow
from ..services import invoicing, plans
from ..services.auth import require_super_admin, require_user

router = APIRouter(prefix="/api/account", dependencies=[Depends(require_user)])


def _not_in_test_mode() -> None:
    """In Subscription Test Mode the real plan must stay untouched: no checkout, no plan change."""
    if plans.TEST_PLAN.get():
        raise HTTPException(409, {"message": "You're in Subscription Test Mode, so the real plan can't be changed. Switch the test plan under Account, or turn Test Mode off first.", "test_mode": True})


class Checkout(BaseModel):
    plan: Literal["plus", "business"]
    company: str = Field(min_length=1, max_length=200)
    billing_email: EmailStr


class PlanChange(BaseModel):
    plan: Literal["free", "plus", "business"]


@router.get("")
def get_account(s: Session = Depends(get_session)) -> dict[str, Any]:
    return plans.summary(s)


@router.post("/checkout")
def checkout(body: Checkout, s: Session = Depends(get_session), user: User = Depends(require_super_admin)) -> dict[str, Any]:
    """Demo checkout: activates the plan without taking a payment. No card data is accepted."""
    _not_in_test_mode()
    acc = plans.account(s)
    acc.plan = body.plan
    acc.company = body.company.strip()
    acc.billing_email = str(body.billing_email)
    acc.plan_started_at = utcnow()
    s.add(BillingEvent(kind="checkout", plan=body.plan, amount_eur=plans.PLANS[body.plan].price_eur or 0, charged=False, company=acc.company, billing_email=acc.billing_email, user_email=user.email))
    s.commit()
    invoicing.ensure_subscription_invoices(s)  # the first period's invoice (issued at once if Számlázz.hu is connected)
    return {**plans.summary(s), "charged": False}


@router.post("/plan")
def change_plan(body: PlanChange, s: Session = Depends(get_session), user: User = Depends(require_super_admin)) -> dict[str, Any]:
    _not_in_test_mode()
    acc = plans.account(s)
    acc.plan = body.plan
    acc.plan_started_at = utcnow() if body.plan != "free" else None
    s.add(BillingEvent(kind="plan_change", plan=body.plan, amount_eur=0, charged=False, company=acc.company, billing_email=acc.billing_email, user_email=user.email))
    s.commit()
    return plans.summary(s)


# --- billing (founding admin only) -------------------------------------------------------------------


class BillingDetails(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    billing_email: EmailStr
    country: str = Field("Magyarország", max_length=60)
    postcode: str = Field("", max_length=12)
    city: str = Field("", max_length=80)
    address: str = Field("", max_length=200)
    tax_number: str = Field("", max_length=30)


def _billing(s: Session) -> dict[str, Any]:
    invoicing.ensure_subscription_invoices(s)  # renewals: one invoice per started monthly period
    acc = plans.account(s)
    plan = plans.PLANS.get(acc.plan, plans.PLANS["free"])
    period = renews = None
    if acc.plan != "free" and acc.plan_started_at:
        p_start, p_end = invoicing.periods(acc.plan_started_at.date(), utcnow().date())[-1]
        period = {"start": p_start.isoformat(), "end": p_end.isoformat()}
        renews = (p_end + timedelta(days=1)).isoformat()
    invoices = invoicing.list_for(s, invoicing.PLATFORM)
    open_amount = sum((Decimal(i.gross) for i in invoices if i.paid_at is None), Decimal(0))
    events = s.scalars(select(BillingEvent).order_by(BillingEvent.id.desc()).limit(50))
    real = plans.PLANS.get(acc.plan, plans.PLANS["free"])
    usage = plans.usage(s)
    return {
        "plan": plan.to_dict(),
        "status": "active" if acc.plan != "free" else "free",
        "started_at": acc.plan_started_at.isoformat() if acc.plan_started_at else None,
        "period": period,
        "renews_at": renews,
        "monthly_eur": plan.price_eur or 0,
        "company": acc.company,
        "billing_email": acc.billing_email,
        "address": invoicing.billing_address(s),
        "usage": [
            {"key": "analyses", "label": "Video analyses this month", "used": usage["analyses_this_month"], "limit": real.analyses_per_month},
            {"key": "apps", "label": "Apps", "used": usage["apps"], "limit": real.apps},
            {"key": "members", "label": "People per app", "used": None, "limit": real.members},
        ],
        "invoicing": invoicing.public_config(invoicing.config(s, invoicing.PLATFORM)),
        "invoices": [invoicing.public(i) for i in invoices],
        "open_amount": str(open_amount),
        "payment_method": None,  # online card payment isn't connected; invoices are paid by bank transfer
        "billing_live": False,
        "history": [
            {"id": e.id, "kind": e.kind, "plan": e.plan, "amount_eur": e.amount_eur, "charged": e.charged, "by": e.user_email, "at": e.created_at.isoformat()}
            for e in events
        ],
    }


@router.get("/billing")
def get_billing(s: Session = Depends(get_session), _user: User = Depends(require_super_admin)) -> dict[str, Any]:
    return _billing(s)


@router.put("/billing")
def update_billing(body: BillingDetails, s: Session = Depends(get_session), _user: User = Depends(require_super_admin)) -> dict[str, Any]:
    acc = plans.account(s)
    acc.company = body.company.strip()
    acc.billing_email = str(body.billing_email)
    prof = s.get(BillingProfile, "default") or BillingProfile(id="default")
    for k in ("country", "postcode", "city", "address", "tax_number"):
        setattr(prof, k, getattr(body, k).strip())
    s.add(prof)
    s.flush()
    # Drafts that aren't issued yet pick up the corrected details.
    for inv in invoicing.list_for(s, invoicing.PLATFORM):
        if inv.status != "issued":
            inv.buyer = invoicing.subscriber_buyer(s)
    s.commit()
    return _billing(s)


def _platform_invoice(s: Session, invoice_id: str) -> Invoice:
    inv = s.get(Invoice, invoice_id)
    if not inv or inv.scope != invoicing.PLATFORM:
        raise HTTPException(404, "Invoice not found.")
    return inv


@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: str, s: Session = Depends(get_session), _user: User = Depends(require_super_admin)) -> dict[str, Any]:
    return invoicing.public(_platform_invoice(s, invoice_id))


@router.post("/invoices/{invoice_id}/issue")
def issue_invoice(invoice_id: str, s: Session = Depends(get_session), _user: User = Depends(require_super_admin)) -> dict[str, Any]:
    inv = invoicing.issue(s, _platform_invoice(s, invoice_id))
    return invoicing.public(inv)


@router.post("/invoices/{invoice_id}/paid")
def mark_paid(invoice_id: str, s: Session = Depends(get_session), _user: User = Depends(require_super_admin)) -> dict[str, Any]:
    inv = _platform_invoice(s, invoice_id)
    inv.paid_at = None if inv.paid_at else utcnow()
    s.commit()
    return invoicing.public(inv)


@router.get("/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: str, s: Session = Depends(get_session), _user: User = Depends(require_super_admin)) -> FileResponse:
    inv = _platform_invoice(s, invoice_id)
    path = invoicing.pdf_path(inv)
    if not path:
        raise HTTPException(404, "This invoice has no PDF yet: it is created when the invoice is issued.")
    return FileResponse(path, media_type="application/pdf", filename=f"{inv.number or inv.id}.pdf")
