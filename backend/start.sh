#!/bin/sh
# Container entrypoint. Serves HTTPS on 7413 when TLS_CERT_FILE and TLS_KEY_FILE point at a PEM
# certificate (full chain) and its private key; plain HTTP otherwise (e.g. behind a TLS proxy).
set -eu

if [ -n "${TLS_CERT_FILE:-}" ] && [ -n "${TLS_KEY_FILE:-}" ]; then
  if [ ! -r "$TLS_CERT_FILE" ] || [ ! -r "$TLS_KEY_FILE" ]; then
    echo "TLS_CERT_FILE / TLS_KEY_FILE are set but not readable by uid $(id -u): $TLS_CERT_FILE $TLS_KEY_FILE" >&2
    exit 1
  fi
  echo "Serving HTTPS on 7413 with $TLS_CERT_FILE"
  exec uvicorn app.main:app --host 0.0.0.0 --port 7413 --proxy-headers --forwarded-allow-ips '*' \
    --ssl-certfile "$TLS_CERT_FILE" --ssl-keyfile "$TLS_KEY_FILE"
fi

# --proxy-headers: correct scheme/host behind Caddy, Nginx, Traefik or the DSM reverse proxy.
exec uvicorn app.main:app --host 0.0.0.0 --port 7413 --proxy-headers --forwarded-allow-ips '*'
