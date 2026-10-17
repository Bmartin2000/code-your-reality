"""Simple sign-in for the Studio, using only the standard library.

- Passwords: PBKDF2-HMAC-SHA256 with a random salt (hashlib), compared in constant time.
- Sessions: a random token in an HttpOnly, SameSite=Lax cookie; the database stores only its hash.
- The first user ever registered becomes admin. Admins can add and remove users.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import AuthSession, User, get_session

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
    secure = get_settings().cookie_secure or request.url.scheme == "https"
    response.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax", secure=secure, path="/")


def end_session(s: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        row = s.get(AuthSession, _token_hash(token))
        if row:
            s.delete(row)
            s.commit()
    response.delete_cookie(COOKIE, path="/")


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
