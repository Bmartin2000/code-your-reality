"""Sign-in, registration and user management for the Studio."""

from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import AuthSession, PlanTestEvent, User, get_session
from ..services import auth, invoicing, plans

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# A light check on purpose: intranet addresses (name@company.local) are fine for a sign-in name.
Email = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)


class Register(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Email
    password: str = Field(min_length=auth.MIN_PASSWORD, max_length=200)


class Login(BaseModel):
    email: str = Email
    password: str = Field(min_length=1, max_length=200)


class NewUser(Register):
    role: Literal["admin", "user"] = "user"


class RoleChange(BaseModel):
    role: Literal["admin", "user"]


class TestMode(BaseModel):
    plan: Literal["free", "plus"] | None  # None switches Test Mode off


def _create_user(s: Session, body: Register, role: str) -> User:
    user = User(email=body.email.strip().lower(), name=body.name.strip(), password_hash=auth.hash_password(body.password), role=role)
    s.add(user)
    try:
        s.commit()
    except IntegrityError:
        s.rollback()
        raise HTTPException(409, {"message": "An account with this email already exists.", "field_errors": {"email": "Already registered."}}) from None
    return user


@router.get("/auth/me")
def me(s: Session = Depends(get_session), user: User | None = Depends(auth.current_user_optional)) -> dict[str, Any]:
    count = auth.user_count(s)
    return {
        "user": {**auth.public_user(user), "super_admin": auth.is_super_admin(s, user)} if user else None,
        "needs_setup": count == 0,
        "signup_open": count == 0 or get_settings().allow_signup,
    }


@router.post("/auth/register", status_code=201)
def register(body: Register, request: Request, response: Response, s: Session = Depends(get_session)) -> dict[str, Any]:
    first = auth.user_count(s) == 0
    if not first and not get_settings().allow_signup:
        raise HTTPException(403, "Registration is closed. Ask an admin to create your account.")
    user = _create_user(s, body, "admin" if first else "user")
    if first:
        auth.super_admin(s)  # pin the founding account by its id
    auth.start_session(s, user, request, response)
    return {"user": auth.public_user(user)}


@router.post("/auth/login")
def login(body: Login, request: Request, response: Response, s: Session = Depends(get_session)) -> dict[str, Any]:
    ip = request.client.host if request.client else "unknown"
    auth.check_throttle(ip)
    user = s.scalars(select(User).where(User.email == body.email.strip().lower())).first()
    if not user or not auth.verify_password(body.password, user.password_hash):
        auth.record_failure(ip)
        raise HTTPException(401, {"message": "Wrong email or password."})
    auth.start_session(s, user, request, response)
    return {"user": auth.public_user(user)}


@router.post("/auth/logout")
def logout(request: Request, response: Response, s: Session = Depends(get_session)) -> dict[str, str]:
    auth.end_session(s, request, response)
    return {"status": "signed out"}


# --- admin: users -------------------------------------------------------------------------------


@router.get("/users")
def list_users(s: Session = Depends(get_session), _admin: User = Depends(auth.require_admin)) -> list[dict[str, Any]]:
    return [auth.public_user(u) for u in s.scalars(select(User).order_by(User.created_at))]


@router.post("/users", status_code=201)
def create_user(body: NewUser, s: Session = Depends(get_session), _admin: User = Depends(auth.require_admin)) -> dict[str, Any]:
    return auth.public_user(_create_user(s, body, body.role))


@router.patch("/users/{user_id}")
def change_role(user_id: str, body: RoleChange, s: Session = Depends(get_session), admin: User = Depends(auth.require_admin)) -> dict[str, Any]:
    user = s.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found.")
    if user.id == admin.id and body.role != "admin":
        raise HTTPException(400, "You can't remove your own admin role.")
    if body.role != "admin" and auth.is_super_admin(s, user):
        raise HTTPException(400, "The founding admin always stays an admin.")
    user.role = body.role
    s.commit()
    return auth.public_user(user)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, s: Session = Depends(get_session), admin: User = Depends(auth.require_admin)) -> None:
    user = s.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found.")
    if user.id == admin.id:
        raise HTTPException(400, "You can't delete your own account.")
    if auth.is_super_admin(s, user):
        raise HTTPException(400, "The founding admin can't be removed.")
    if user.role == "admin" and (s.scalar(select(func.count()).select_from(User).where(User.role == "admin")) or 0) <= 1:
        raise HTTPException(400, "Keep at least one admin.")
    for row in s.scalars(select(AuthSession).where(AuthSession.user_id == user.id)):
        s.delete(row)
    s.delete(user)
    s.commit()


# --- Subscription Test Mode (founding Super Admin only) ---------------------------------------------


def _test_mode_state(s: Session, user: User) -> dict[str, Any]:
    row = auth.super_admin(s)
    real = plans.account(s).plan
    effective = plans.PLANS.get(row.test_plan or real, plans.PLANS["free"])
    log = s.scalars(select(PlanTestEvent).where(PlanTestEvent.user_id == user.id).order_by(PlanTestEvent.id.desc()).limit(10))
    return {
        "plan": row.test_plan,
        "real_plan": real,
        "effective": effective.to_dict(),
        "usage": plans.usage(s),
        "log": [{"from": e.from_plan, "to": e.to_plan, "at": e.created_at.isoformat()} for e in log],
    }


@router.get("/admin/test-mode")
def get_test_mode(s: Session = Depends(get_session), user: User = Depends(auth.require_super_admin)) -> dict[str, Any]:
    return _test_mode_state(s, user)


@router.put("/admin/test-mode")
def set_test_mode(body: TestMode, s: Session = Depends(get_session), user: User = Depends(auth.require_super_admin)) -> dict[str, Any]:
    """Changes only what this account experiences. The workspace's real plan and billing stay as they are."""
    auth.set_test_plan(s, user, body.plan)
    return _test_mode_state(s, user)


# --- Invoicing settings for subscriptions (founding Super Admin only) ---------------------------------


class InvoicingSettings(BaseModel):
    provider: Literal["none", "szamlazz"] = "none"
    agent_key: str | None = Field(None, max_length=200)
    remove_agent_key: bool = False
    e_invoice: bool = True
    send_email: bool = True
    auto_issue: bool = True
    language: Literal["hu", "en", "de"] = "hu"
    currency: Literal["HUF", "EUR", "USD"] = "EUR"
    vat_rate: Literal["27", "18", "5", "0", "AAM", "TAM", "EU", "EUK", "MAA", "F.AFA", "K.AFA"] = "27"
    payment_days: int = Field(8, ge=0, le=90)
    note: str = Field("", max_length=500)


@router.get("/admin/invoicing")
def get_invoicing(s: Session = Depends(get_session), _user: User = Depends(auth.require_super_admin)) -> dict[str, Any]:
    c = invoicing.config(s, invoicing.PLATFORM)
    s.commit()
    return invoicing.public_config(c)


@router.put("/admin/invoicing")
def set_invoicing(body: InvoicingSettings, s: Session = Depends(get_session), user: User = Depends(auth.require_super_admin)) -> dict[str, Any]:
    c = invoicing.update_config(s, invoicing.PLATFORM, body.model_dump())
    log.info("Subscription invoicing set to %s by %s", c.provider, user.email)
    return invoicing.public_config(c)
