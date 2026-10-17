"""Database engine, session factory and ORM models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Iterator

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, TypeDecorator, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from .config import get_settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex[:16]


class UTCDateTime(TypeDecorator):
    """SQLite stores datetimes without a zone; always hand back timezone-aware UTC values."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSON, list[Any]: JSON}


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    # "sample" projects are built from predefined example data; "analysis" from real uploads;
    # "manual" from a blank or template workflow.
    origin: Mapped[str] = mapped_column(String(20), default="analysis")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    narration: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)

    media: Mapped[list["MediaAsset"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    workflows: Mapped[list["WorkflowVersion"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="WorkflowVersion.version"
    )
    jobs: Mapped[list["Job"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    audit: Mapped[list["AuditEvent"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    duration_seconds: Mapped[float | None] = mapped_column(default=None)
    has_audio: Mapped[bool | None] = mapped_column(default=None)
    transcript: Mapped[list[Any] | None] = mapped_column(JSON, default=None)
    transcript_source: Mapped[str | None] = mapped_column(String(40), default=None)
    frames: Mapped[list[Any] | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    project: Mapped[Project] = relationship(back_populates="media")


class WorkflowVersion(Base):
    __tablename__ = "workflow_versions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    definition: Mapped[dict[str, Any]] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(40))  # ai_extraction | sample | template | blank | human_edit
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    project: Mapped[Project] = relationship(back_populates="workflows")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(20))  # analysis | compile
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued | running | succeeded | failed
    stages: Mapped[list[Any]] = mapped_column(JSON, default=list)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)
    error: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)

    project: Mapped[Project] = relationship(back_populates="jobs")


class GeneratedApp(Base):
    __tablename__ = "generated_apps"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    workflow_version_id: Mapped[str] = mapped_column(ForeignKey("workflow_versions.id"))
    name: Mapped[str] = mapped_column(String(200))
    manifest: Mapped[dict[str, Any]] = mapped_column(JSON)
    is_sample: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class User(Base):
    """A person who can sign in to the Studio. The first registered user becomes admin."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10), default="user")  # admin | user
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class AuthSession(Base):
    """A signed-in browser. Only a SHA-256 hash of the cookie token is stored."""

    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())


class SuperAdmin(Base):
    """The founding account: the first user ever registered, pinned by user id (not by role).

    Holds that account's private Subscription Test Mode. The workspace's real plan (Account.plan)
    is never touched by it.
    """

    __tablename__ = "super_admin"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)  # a single row
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    test_plan: Mapped[str | None] = mapped_column(String(20), default=None)  # None = real plan
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class PlanTestEvent(Base):
    """Log of Subscription Test Mode switches."""

    __tablename__ = "plan_test_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    from_plan: Mapped[str | None] = mapped_column(String(20))
    to_plan: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Account(Base):
    """The workspace's subscription. Single-tenant build: one row with id 'default'."""

    __tablename__ = "account"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default="default")
    plan: Mapped[str] = mapped_column(String(20), default="free")  # free | plus | business
    company: Mapped[str] = mapped_column(String(200), default="")
    billing_email: Mapped[str] = mapped_column(String(254), default="")
    plan_started_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class AppSettings(Base):
    """Per-application settings kept outside the app row so existing databases need no migration."""

    __tablename__ = "app_settings"

    app_id: Mapped[str] = mapped_column(ForeignKey("generated_apps.id", ondelete="CASCADE"), primary_key=True)
    access_mode: Mapped[str] = mapped_column(String(10), default="open")  # open | team
    calendar_token: Mapped[str] = mapped_column(String(48), default=lambda: uuid.uuid4().hex)


class AppCustomization(Base):
    """Names the owner chose for an app and its sections (and their colours). Applied on top of the
    compiled manifest when it is served, so it survives recompiling."""

    __tablename__ = "app_customizations"

    app_id: Mapped[str] = mapped_column(ForeignKey("generated_apps.id", ondelete="CASCADE"), primary_key=True)
    name: Mapped[str | None] = mapped_column(String(120), default=None)
    sections: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # entity key -> {label, plural_label, color}
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class BillingEvent(Base):
    """Plan changes and demo checkouts of the workspace. No payment is taken in this build (charged=False)."""

    __tablename__ = "billing_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(20))  # checkout | plan_change
    plan: Mapped[str] = mapped_column(String(20))
    amount_eur: Mapped[int] = mapped_column(Integer, default=0)
    charged: Mapped[bool] = mapped_column(default=False)
    company: Mapped[str] = mapped_column(String(200), default="")
    billing_email: Mapped[str] = mapped_column(String(254), default="")
    user_email: Mapped[str] = mapped_column(String(254), default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class AppMember(Base):
    """A person with access to a generated application, identified by a personal access key."""

    __tablename__ = "app_members"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    app_id: Mapped[str] = mapped_column(ForeignKey("generated_apps.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))  # owner | manager | staff | viewer
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True, default=lambda: uuid.uuid4().hex + uuid.uuid4().hex)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class AppWebhook(Base):
    """Outgoing HTTP notification for application events (create, transition, effect, rejection)."""

    __tablename__ = "app_webhooks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    app_id: Mapped[str] = mapped_column(ForeignKey("generated_apps.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(500))
    secret: Mapped[str] = mapped_column(String(64), default=lambda: uuid.uuid4().hex)
    active: Mapped[bool] = mapped_column(default=True)
    last_status: Mapped[str | None] = mapped_column(String(200), default=None)
    last_sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Record(Base):
    """A row of operational data inside a generated application (e.g. an item, customer or rental)."""

    __tablename__ = "records"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    app_id: Mapped[str] = mapped_column(ForeignKey("generated_apps.id", ondelete="CASCADE"), index=True)
    entity: Mapped[str] = mapped_column(String(64), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class RecordEvent(Base):
    """Operational history of a generated application: creations, transitions, rule rejections."""

    __tablename__ = "record_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    app_id: Mapped[str] = mapped_column(ForeignKey("generated_apps.id", ondelete="CASCADE"), index=True)
    record_id: Mapped[str | None] = mapped_column(String(32), default=None)
    entity: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(40))  # created | updated | transition | effect | rejected
    summary: Mapped[str] = mapped_column(Text)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class AuditEvent(Base):
    """Human review trail for a project: confirmations, rejections and edits of extracted items."""

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    actor: Mapped[str] = mapped_column(String(40), default="reviewer")
    action: Mapped[str] = mapped_column(String(40))
    target_kind: Mapped[str] = mapped_column(String(40))
    target_id: Mapped[str] = mapped_column(String(80))
    summary: Mapped[str] = mapped_column(Text)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    project: Mapped[Project] = relationship(back_populates="audit")


_settings = get_settings()
engine = create_engine(
    _settings.db_url,
    connect_args={"check_same_thread": False, "timeout": 30} if _settings.db_url.startswith("sqlite") else {},
)


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - driver hook
    if _settings.db_url.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
