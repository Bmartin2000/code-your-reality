"""Production entry point: `python -m app.serve`.

Runs the API (and the built frontend, if FRONTEND_DIST is set) with the host, port and TLS settings
from the environment:

  HOST=0.0.0.0  PORT=7413
  SSL_CERTFILE=/certs/fullchain.pem  SSL_KEYFILE=/certs/privkey.pem   # HTTPS (camera recording needs it)
  FORWARDED_ALLOW_IPS=127.0.0.1   # trust X-Forwarded-* from this proxy (when TLS ends at a proxy)

`python -m app.serve --check` is the container health check: it calls /health over HTTP or HTTPS,
whichever the server runs, and exits non-zero when the server doesn't answer.
"""

from __future__ import annotations

import ssl
import sys
import urllib.request

import uvicorn

from .config import get_settings


def _check() -> int:
    s = get_settings()
    scheme = "https" if s.ssl_certfile else "http"
    ctx = ssl._create_unverified_context() if scheme == "https" else None  # local check; the cert may be for another name
    try:
        with urllib.request.urlopen(f"{scheme}://127.0.0.1:{s.port}/health", timeout=5, context=ctx) as r:
            return 0 if r.status == 200 else 1
    except Exception as exc:  # noqa: BLE001 - any failure means unhealthy
        print(f"unhealthy: {exc}", file=sys.stderr)
        return 1


def main() -> int:
    if "--check" in sys.argv:
        return _check()
    s = get_settings()
    problems = s.tls_problems()
    if problems:
        for p in problems:
            print(f"Configuration error: {p}", file=sys.stderr)
        return 2
    for w in s.deployment_warnings():
        print(f"Warning: {w}", file=sys.stderr)
    uvicorn.run(
        "app.main:app",
        host=s.host,
        port=s.port,
        ssl_certfile=str(s.ssl_certfile) if s.ssl_certfile else None,
        ssl_keyfile=str(s.ssl_keyfile) if s.ssl_keyfile else None,
        proxy_headers=True,
        forwarded_allow_ips=s.forwarded_allow_ips,
        log_level="info",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
