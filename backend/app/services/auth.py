"""Simple sign-in for the Studio, using only the standard library.

- Passwords: PBKDF2-HMAC-SHA256 with a random salt (hashlib), compared in constant time.
- Sessions: a random token in an HttpOnly, SameSite=Lax cookie; the database stores only its hash.
- The first user ever registered becomes admin. Admins can add and remove users.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import AuthSession, PlanTestEvent, SessionLocal, SuperAdmin, User, get_session

log = logging.getLogger(__name__)

COOKIE = "cyr_session"
SESSION_DAYS = 30
PBKDF2_ITERATIONS = 390_000
MIN_PASSWORD = 8


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def user_count(s: Session) -> int:
    return s.scalar(select(func.count()).select_from(User)) or 0


def public_user(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "created_at": u.created_at.isoformat()}


def start_session(s: Session, user: User, request: Request, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    s.add(AuthSession(token_hash=_token_hash(token), user_id=user.id, expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)))
    s.commit()
    response.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, **cookie_attrs(request))


def cookie_attrs(request: Request) -> dict:
    """HttpOnly always. SameSite from COOKIE_SAMESITE; None (frontend on another site) is always Secure."""
    s = get_settings()
    secure = s.cookie_secure or request.url.scheme == "https" or s.cookie_samesite == "none"
    return {"httponly": True, "samesite": s.cookie_samesite, "secure": secure, "path": "/", "domain": s.cookie_domain or None}


def end_session(s: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        row = s.get(AuthSession, _token_hash(token))
        if row:
            s.delete(row)
            s.commit()
    attrs = cookie_attrs(request)
    response.delete_cookie(COOKIE, path="/", domain=attrs["domain"], secure=attrs["secure"], httponly=True, samesite=attrs["samesite"])


def current_user_optional(request: Request, s: Session = Depends(get_session)) -> User | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    row = s.get(AuthSession, _token_hash(token))
    if not row:
        return None
    if row.expires_at < datetime.now(timezone.utc):
        s.delete(row)
        s.commit()
        return None
    return s.get(User, row.user_id)


def require_user(user: User | None = Depends(current_user_optional)) -> User:
    if not user:
        raise HTTPException(401, {"message": "Please sign in.", "auth_required": True})
    return user


def require_admin(user: User = Depends(require_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Only admins can do this.")
    return user


# --- founding Super Admin and Subscription Test Mode -------------------------------------------------


def super_admin(s: Session) -> SuperAdmin | None:
    """The founding account. Pinned at the first registration; installs that predate this record pin
    their earliest admin once. It never moves to another user afterwards."""
    row = s.get(SuperAdmin, 1)
    if row:
        return row
    first = s.scalars(select(User).where(User.role == "admin").order_by(User.created_at, User.id)).first()
    if not first:
        return None
    try:
        row = SuperAdmin(id=1, user_id=first.id)
        s.add(row)
        s.commit()
    except IntegrityError:  # another request pinned it first
        s.rollback()
        row = s.get(SuperAdmin, 1)
    return row


def is_super_admin(s: Session, user: User | None) -> bool:
    row = super_admin(s) if user else None
    return bool(row and row.user_id == user.id)


def require_super_admin(user: User = Depends(require_user), s: Session = Depends(get_session)) -> User:
    if not is_super_admin(s, user):
        raise HTTPException(403, "Only the founding admin can use Subscription Test Mode.")
    return user


def set_test_plan(s: Session, user: User, plan: str | None) -> None:
    row = super_admin(s)
    assert row and row.user_id == user.id
    previous = row.test_plan
    row.test_plan = plan
    s.add(PlanTestEvent(user_id=user.id, from_plan=previous, to_plan=plan))
    s.commit()
    log.info("Subscription Test Mode: %s switched from %s to %s", user.email, previous or "off", plan or "off")


def test_plan_for_token(token: str) -> str | None:
    """The test plan for a session cookie: set only for the Super Admin, None for everyone else."""
    with SessionLocal() as s:
        row = s.get(AuthSession, _token_hash(token))
        if not row or row.expires_at < datetime.now(timezone.utc):
            return None
        sa = s.get(SuperAdmin, 1)
        return sa.test_plan if sa and sa.user_id == row.user_id else None


# --- brute-force brake: at most 10 failed sign-ins per IP per 5 minutes ---------------------------

_failures: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()
WINDOW, MAX_FAILURES = 300, 10


def check_throttle(ip: str) -> None:
    with _lock:
        q = _failures[ip]
        while q and time.monotonic() - q[0] > WINDOW:
            q.popleft()
        if len(q) >= MAX_FAILURES:
            raise HTTPException(429, "Too many failed sign-ins. Wait a few minutes and try again.")


def record_failure(ip: str) -> None:
    with _lock:
        _failures[ip].append(time.monotonic())
