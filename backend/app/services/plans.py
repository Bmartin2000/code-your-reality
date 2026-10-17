"""Subscription plans and their server-side limits.

Payment is not connected in this build: upgrading goes through a demo checkout that activates the
plan without charging anything (the UI says so). Limits are enforced here, on the server.
"""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import Account, GeneratedApp, Job, Project


@dataclass(frozen=True)
class PlanLimits:
    id: str
    name: str
    price_eur: int | None
    apps: int
    members: int
    analyses_per_month: int
    frame_samples: int
    reports: bool
    integrations: bool
    team: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


PLANS: dict[str, PlanLimits] = {
    "free": PlanLimits("free", "Free demo", 0, apps=1, members=1, analyses_per_month=3, frame_samples=6, reports=False, integrations=False, team=False),
    "plus": PlanLimits("plus", "Plus", 19, apps=5, members=5, analyses_per_month=30, frame_samples=12, reports=True, integrations=True, team=True),
    "business": PlanLimits("business", "Business", 49, apps=25, members=25, analyses_per_month=200, frame_samples=12, reports=True, integrations=True, team=True),
}

# Subscription Test Mode: the plan the founding Super Admin is testing as, for the current request
# only. Set by TestPlanMiddleware (main.py) after checking the session; None for everyone else.
TEST_PLAN: ContextVar[str | None] = ContextVar("cyr_test_plan", default=None)
TEST_PLANS = ("free", "plus")

FEATURE_NAMES = {"reports": "Reports", "integrations": "Connections", "team": "Team access"}


def account(s: Session) -> Account:
    acc = s.get(Account, "default")
    if not acc:
        try:
            acc = Account(id="default", plan="free")
            s.add(acc)
            s.commit()
        except IntegrityError:  # another request created it first
            s.rollback()
            acc = s.get(Account, "default")
    return acc


def ensure_account() -> None:
    """Create the workspace row at startup so concurrent first requests never race to insert it."""
    from ..db import SessionLocal

    with SessionLocal() as s:
        account(s)


def limits(s: Session) -> PlanLimits:
    """The plan in effect for this request: the test plan in Test Mode, otherwise the workspace's plan."""
    return PLANS.get(TEST_PLAN.get() or account(s).plan, PLANS["free"])


def usage(s: Session) -> dict[str, int]:
    start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    apps = s.scalar(select(func.count()).select_from(GeneratedApp).join(Project, Project.id == GeneratedApp.project_id).where(Project.origin != "sample")) or 0
    analyses = s.scalar(select(func.count()).select_from(Job).where(Job.kind == "analysis", Job.created_at >= start)) or 0
    return {"apps": apps, "analyses_this_month": analyses}


def upgrade_required(feature: str, plan: PlanLimits, detail: str | None = None) -> HTTPException:
    return HTTPException(
        402,
        {
            "message": detail or f"{FEATURE_NAMES.get(feature, feature)} is part of Plus. You're on the {plan.name} plan.",
            "upgrade": True,
            "feature": feature,
        },
    )


def require_feature(s: Session, feature: str) -> PlanLimits:
    plan = limits(s)
    if not getattr(plan, feature):
        raise upgrade_required(feature, plan)
    return plan


def check_new_app(s: Session, project: Project) -> None:
    """Building a new (non-sample) app must fit the plan. Rebuilding an existing app is always allowed."""
    if project.origin == "sample":
        return
    if s.scalars(select(GeneratedApp).where(GeneratedApp.project_id == project.id)).first():
        return
    plan = limits(s)
    if usage(s)["apps"] >= plan.apps:
        raise upgrade_required("apps", plan, f"The {plan.name} plan includes {plan.apps} app{'s' if plan.apps != 1 else ''}. Upgrade to build more.")


def check_analysis(s: Session) -> PlanLimits:
    plan = limits(s)
    if usage(s)["analyses_this_month"] >= plan.analyses_per_month:
        raise upgrade_required("analyses", plan, f"The {plan.name} plan includes {plan.analyses_per_month} video analyses a month. Upgrade for more.")
    return plan


def summary(s: Session) -> dict[str, Any]:
    acc = account(s)
    return {
        "plan": limits(s).to_dict(),
        "company": acc.company,
        "billing_email": acc.billing_email,
        "plan_started_at": acc.plan_started_at.isoformat() if acc.plan_started_at else None,
        "usage": usage(s),
        "plans": [p.to_dict() for p in PLANS.values()],
        "billing_live": False,
        # Only present for the Super Admin in Subscription Test Mode; real_plan is never changed by it.
        "test_mode": {"plan": TEST_PLAN.get(), "real_plan": acc.plan} if TEST_PLAN.get() else None,
    }
