// Sign-in configuration, and the checks that decide whether the OIDC library
// has to load at all. Deliberately free of react-oidc-context / oidc-client-ts:
// this module is in the chunk every visitor downloads, and the library is not
// (LIVE_EDITING_PLAN.md D41 — sign-in loads on demand).
//
// People sign in through the ISA's shared pool, `isa-users`, with SlackData's
// own app client in it (D61). There is no SlackData user pool (D62).

/** `https://cognito-idp.eu-central-1.amazonaws.com/<isa-users pool id>` */
export const AUTHORITY = import.meta.env.VITE_ISA_AUTHORITY as string | undefined
/** SlackData's app client in the ISA pool. Public: it is in every ID token. */
export const CLIENT_ID = import.meta.env.VITE_ISA_CLIENT_ID as string | undefined
/** The ISA's hosted sign-in domain, used to sign out of it as well as of us. */
export const LOGIN_DOMAIN = import.meta.env.VITE_ISA_DOMAIN as string | undefined

export type AuthMode = 'isa' | 'dev' | 'unconfigured'

/**
 * | ISA values set | build | mode |
 * |---|---|---|
 * | yes | any | `isa` — the ISA's hosted sign-in |
 * | no | dev | `dev` — a token from sessionStorage, for `fastapi dev` and Cypress |
 * | no | production | `unconfigured` — shut, and visibly so |
 *
 * The dev mode is safe for the reason the API's is: the server decides what a
 * token is worth, and hosted it accepts no dev token at all
 * (slack_data/api/auth.py, slack_data/deployment.py).
 */
export function authMode(): AuthMode {
  if (AUTHORITY && CLIENT_ID) return 'isa'
  return import.meta.env.PROD ? 'unconfigured' : 'dev'
}

/** Where Cypress and local dev put a token. Session-scoped: closing the tab ends it. */
export const DEV_TOKEN_KEY = 'slackdata_admin_token'

/**
 * The ISA app client's callback and sign-out URLs are the BARE origins —
 * `https://slackdata.org`, `https://www.slackdata.org`, `http://localhost:5173`,
 * no path, no trailing slash — and Cognito matches them exactly (D61). So every
 * sign-in returns to `window.location.origin`, and the page the person was on
 * is remembered here and restored afterwards.
 */
export const RETURN_TO_KEY = 'slackdata_return_to'

export function rememberReturnTo(path: string): void {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, path)
  } catch {
    // Storage blocked: the person lands on the home page instead. Harmless.
  }
}

export function takeReturnTo(): string {
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY)
    sessionStorage.removeItem(RETURN_TO_KEY)
    // Only ever a path on this site — never an absolute URL from storage.
    if (path && path.startsWith('/') && !path.startsWith('//')) return path
  } catch {
    // fall through
  }
  return '/'
}

/** True on the page load that carries the sign-in redirect back from the ISA. */
export function isSignInCallback(): boolean {
  const params = new URLSearchParams(window.location.search)
  return (params.has('code') || params.has('error')) && params.has('state')
}

/**
 * True when oidc-client-ts holds a session from earlier in this tab. Read
 * directly from sessionStorage, under the key the library uses
 * (`oidc.user:<authority>:<client_id>`), so a returning signed-in visitor gets
 * the library loaded without anyone else paying for it.
 */
export function hasStoredSession(): boolean {
  if (!AUTHORITY || !CLIENT_ID) return false
  try {
    return sessionStorage.getItem(`oidc.user:${AUTHORITY}:${CLIENT_ID}`) !== null
  } catch {
    return false
  }
}
