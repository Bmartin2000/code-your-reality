/**
 * Where the frontend finds the API, and where the frontend itself is mounted.
 *
 * API base URL, first match wins:
 *   1. config.json next to index.html: { "apiBaseUrl": "https://api.example.com" }. Editable after
 *      deployment, no rebuild needed.
 *   2. VITE_API_BASE_URL at build time.
 *   3. "" = same origin (the Vite dev proxy, or the backend serving the built frontend).
 *
 * Mount path: VITE_BASE_PATH at build time (e.g. /cyr/). Vite prefixes every asset with it and the
 * router uses it as basename, so deep links work under a sub path, not only at the domain root.
 */

let apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

/** The mount path with a trailing slash ("/" or "/cyr/"). */
export const BASE_PATH = import.meta.env.BASE_URL || '/'

/** Router basename: the mount path without the trailing slash ("" at the root). */
export const ROUTER_BASENAME = BASE_PATH.replace(/\/+$/, '')

/** Reads config.json (optional). Never blocks the app for long and never fails it. */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch(`${BASE_PATH}config.json`, { cache: 'no-store', signal: ctrl.signal })
    window.clearTimeout(timer)
    if (!res.ok) return
    const cfg = (await res.json()) as { apiBaseUrl?: unknown }
    if (typeof cfg.apiBaseUrl === 'string' && cfg.apiBaseUrl.trim()) apiBase = cfg.apiBaseUrl.trim().replace(/\/+$/, '')
  } catch {
    /* no config.json: same-origin API */
  }
}

export function apiBaseUrl() {
  return apiBase
}

/** An API path ("/api/...") as the URL to call: on the configured API host, or same origin. */
export function apiUrl(path: string) {
  return path.startsWith('/api') ? `${apiBase}${path}` : path
}

/** An API path as an absolute URL, for links other programs open (calendar feeds). */
export function absoluteApiUrl(path: string) {
  const u = apiUrl(path)
  return /^https?:\/\//.test(u) ? u : `${window.location.origin}${u}`
}

/** A frontend route ("/apps/x") as an absolute link to share, including the mount path. */
export function appLink(path: string) {
  return `${window.location.origin}${ROUTER_BASENAME}${path}`
}
