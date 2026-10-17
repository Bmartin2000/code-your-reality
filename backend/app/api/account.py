"""The workspace's plan and billing.

Everyone signed in can read the plan. Only the founding admin (the account that created the
workspace) can change it and see billing: plan changes, demo checkouts and billing details.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import BillingEvent, User, get_session, utcnow
from ..services import plans
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


def _billing(s: Session) -> dict[str, Any]:
    acc = plans.account(s)
    plan = plans.PLANS.get(acc.plan, plans.PLANS["free"])
    renews = None
    if acc.plan != "free" and acc.plan_started_at:
        start = acc.plan_started_at
        now = utcnow()
        months = (now.year - start.year) * 12 + now.month - start.month + 1
        year, month = start.year + (start.month - 1 + months) // 12, (start.month - 1 + months) % 12 + 1
        day = min(start.day, 28)
        renews = start.replace(year=year, month=month, day=day).isoformat()
    events = s.scalars(select(BillingEvent).order_by(BillingEvent.id.desc()).limit(50))
    return {
        "plan": plan.to_dict(),
        "status": "active" if acc.plan != "free" else "free",
        "started_at": acc.plan_started_at.isoformat() if acc.plan_started_at else None,
        "renews_at": renews,
        "monthly_eur": plan.price_eur or 0,
        "company": acc.company,
        "billing_email": acc.billing_email,
        "payment_method": None,  # online payment isn't connected in this build
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
    s.commit()
    return _billing(s)
