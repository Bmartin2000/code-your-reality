"""Short-lived signed URLs for files that browsers load without request headers (<video>, <img>).

The frontend may run on another origin and authenticates with a bearer header, which media elements
cannot send. Responses therefore carry media URLs with an expiry and an HMAC signature. The expiry is
rounded to an hour so the URL stays stable between polls (the browser keeps its cached video).
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time

from ..config import get_settings

BUCKET_SECONDS = 3600  # URLs stay valid for 1–2 hours
_key: bytes | None = None


def _signing_key() -> bytes:
    global _key
    if _key is None:
        path = get_settings().data_dir / ".url_signing_key"
        if not path.exists():
            path.write_bytes(secrets.token_bytes(32))
            try:
                path.chmod(0o600)
            except OSError:
                pass
        _key = path.read_bytes()
    return _key


def _signature(path: str, exp: int) -> str:
    return hmac.new(_signing_key(), f"{path}\n{exp}".encode(), hashlib.sha256).hexdigest()


def sign(path: str) -> str:
    exp = (int(time.time()) // BUCKET_SECONDS + 2) * BUCKET_SECONDS
    return f"{path}?exp={exp}&sig={_signature(path, exp)}"


def verify(path: str, exp: str | None, sig: str | None) -> bool:
    if not exp or not sig or not exp.isdigit() or int(exp) < time.time():
        return False
    return hmac.compare_digest(_signature(path, int(exp)), sig)
