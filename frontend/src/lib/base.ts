/**
 * Where this frontend runs and where its API lives.
 *
 * The build uses relative asset paths (vite `base: './'`), so the same bundle works from any folder of
 * any web server. The API may be on another origin: set VITE_API_BASE_URL at build time
 * (e.g. https://api.example.com:28470/). It defaults to './', the folder the app is served from.
 */

// Resolved once at startup: after client-side navigation document.baseURI follows the current route.
export const APP_ROOT = new URL(import.meta.env.BASE_URL, document.baseURI)

/** Router basename: the app's folder without the trailing slash ('' at the site root). */
export const ROUTER_BASENAME = APP_ROOT.pathname.replace(/\/+$/, '')

const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || './'
export const API_BASE = new URL(configured.endsWith('/') ? configured : `${configured}/`, APP_ROOT)

/** Absolute URL of an API path such as '/api/projects'. */
export function apiUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), API_BASE).toString()
}

/** Absolute URL of a page of this app such as '/apps/rental' (for share links). */
export function appPageUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), APP_ROOT).toString()
}
