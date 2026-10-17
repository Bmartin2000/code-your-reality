"""The workspace's plan: read it, upgrade through the demo checkout, or go back to Free."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..db import get_session, utcnow
from ..services import plans
from ..services.auth import require_user

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
def checkout(body: Checkout, s: Session = Depends(get_session)) -> dict[str, Any]:
    """Demo checkout: activates the plan without taking a payment. No card data is accepted."""
    _not_in_test_mode()
    acc = plans.account(s)
    acc.plan = body.plan
    acc.company = body.company.strip()
    acc.billing_email = str(body.billing_email)
    acc.plan_started_at = utcnow()
    s.commit()
    return {**plans.summary(s), "charged": False}


@router.post("/plan")
def change_plan(body: PlanChange, s: Session = Depends(get_session)) -> dict[str, Any]:
    _not_in_test_mode()
    acc = plans.account(s)
    acc.plan = body.plan
    acc.plan_started_at = utcnow() if body.plan != "free" else None
    s.commit()
    return plans.summary(s)
