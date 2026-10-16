"""Access to generated applications.

"open" apps (the default) can be used by anyone who has the link. "team" apps require a personal
access key, sent as the X-App-Key header (or ?key= for links). Each key belongs to a member with a
role, and every endpoint checks the role's permissions on the server.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import AppMember, AppSettings, GeneratedApp

ROLES = ("owner", "manager", "staff", "viewer")
PERMISSIONS: dict[str, set[str]] = {
    "viewer": {"read"},
    "staff": {"read", "create", "transition"},
    "manager": {"read", "create", "transition", "update", "seed", "reports"},
    "owner": {"read", "create", "transition", "update", "seed", "reports", "reset", "admin"},
}
ROLE_LABELS = {"owner": "Owner", "manager": "Manager", "staff": "Staff", "viewer": "Viewer"}


@dataclass
class Viewer:
    role: str
    member: AppMember | None

    def can(self, permission: str) -> bool:
        return permission in PERMISSIONS[self.role]


def settings_for(s: Session, app: GeneratedApp) -> AppSettings:
    st = s.get(AppSettings, app.id)
    if not st:
        st = AppSettings(app_id=app.id)
        s.add(st)
        s.commit()
    return st


def viewer_for(s: Session, app: GeneratedApp, request: Request) -> Viewer:
    st = settings_for(s, app)
    if st.access_mode != "team":
        return Viewer("owner", None)
    key = request.headers.get("x-app-key") or request.query_params.get("key")
    member = s.scalars(select(AppMember).where(AppMember.app_id == app.id, AppMember.key == key)).first() if key else None
    if not member:
        raise HTTPException(401, {"message": "This app is private. Open it with the personal link you received from its owner.", "auth": True})
    return Viewer(member.role, member)


def require(viewer: Viewer, permission: str) -> None:
    if not viewer.can(permission):
        raise HTTPException(403, {"message": f"Your role ({ROLE_LABELS[viewer.role]}) can't do this. Ask the app's owner.", "role": viewer.role})


def owner_key(s: Session, app: GeneratedApp) -> str | None:
    """The owner's key, used by the Studio (the owner's console) to open a private app."""
    st = s.get(AppSettings, app.id)
    if not st or st.access_mode != "team":
        return None
    m = s.scalars(select(AppMember).where(AppMember.app_id == app.id, AppMember.role == "owner").order_by(AppMember.created_at)).first()
    return m.key if m else None
