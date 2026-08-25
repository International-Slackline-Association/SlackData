// Admin authentication for the SPA, in the two modes the backend supports.
//
// | `VITE_COGNITO_AUTHORITY` set | behaviour |
// |---|---|
// | yes | Cognito hosted login, authorization code + PKCE, via react-oidc-context. |
// | no  | a token read from sessionStorage — local dev and Cypress. |
//
// The second mode mirrors `ADMIN_DEV_TOKEN` in slack_data/api/auth.py, and is
// safe for the same reason: the *server* decides what a token is worth. Pasting
// a token here gets you a page that renders; the API still rejects it unless it
// is genuinely valid. Hosted, the dev token is dead — auth.py stops accepting it
// the moment a pool is configured — so this path cannot be used against the live
// site even by someone who reads this file.
//
// Wrapped only around /admin (see App.tsx). No other page pays for the OIDC
// library, and no visitor to a gear page loads it at all.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from 'react-oidc-context'

/** Where Cypress and local dev put a token. Session-scoped: closing the tab ends it. */
export const ADMIN_TOKEN_KEY = 'slackdata_admin_token'

const AUTHORITY = import.meta.env.VITE_COGNITO_AUTHORITY as string | undefined
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined

export interface AdminAuth {
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  /** True in the sessionStorage mode — the page says so, rather than implying a real login. */
  isDevMode: boolean
  signIn: () => void
  signOut: () => void
}

const AdminAuthContext = createContext<AdminAuth | undefined>(undefined)

/** A hosted build with no pool configured: shut, and visibly so. */
const UNCONFIGURED: AdminAuth = {
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error:
    'Admin sign-in is not configured for this deployment. ' +
    'VITE_COGNITO_AUTHORITY and VITE_COGNITO_CLIENT_ID must be set at build time.',
  isDevMode: false,
  signIn: () => {},
  signOut: () => {},
}

export function useAdminAuth(): AdminAuth {
  const value = useContext(AdminAuthContext)
  if (!value) {
    throw new Error('useAdminAuth must be used inside <AdminAuthProvider>')
  }
  return value
}

// --- Cognito ---------------------------------------------------------------

/**
 * Maps react-oidc-context's state onto AdminAuth.
 *
 * Must be a child of <AuthProvider>, which is why this is a separate component
 * rather than a branch inside AdminAuthProvider: `useAuth` is a hook, and hooks
 * cannot be called conditionally.
 */
function CognitoBridge({ children }: { children: ReactNode }) {
  const auth = useAuth()

  const value = useMemo<AdminAuth>(
    () => ({
      // The API verifies the ID token (`token_use === 'id'`), not the access
      // token — sending the wrong one is a 401 that looks like a login bug.
      token: auth.user?.id_token ?? null,
      isAuthenticated: auth.isAuthenticated,
      isLoading: auth.isLoading,
      error: auth.error?.message ?? null,
      isDevMode: false,
      signIn: () => void auth.signinRedirect(),
      signOut: () => void auth.removeUser(),
    }),
    [auth],
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

// --- Local dev / Cypress ---------------------------------------------------

function DevBridge({ children }: { children: ReactNode }) {
  const read = () => sessionStorage.getItem(ADMIN_TOKEN_KEY)
  const [token, setToken] = useState<string | null>(read)

  // Cypress sets the token before visiting the page, but a spec may also set it
  // while the page is open. Storage events cover other tabs; the interval covers
  // this one, cheaply, because there is no event for same-document writes.
  useEffect(() => {
    const sync = () => setToken(current => (current === read() ? current : read()))
    window.addEventListener('storage', sync)
    const timer = window.setInterval(sync, 500)
    return () => {
      window.removeEventListener('storage', sync)
      window.clearInterval(timer)
    }
  }, [])

  const signIn = useCallback(() => {
    const entered = window.prompt('Admin token (local development only)')
    if (entered) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, entered)
      setToken(entered)
    }
  }, [])

  const signOut = useCallback(() => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY)
    setToken(null)
  }, [])

  const value = useMemo<AdminAuth>(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      isLoading: false,
      error: null,
      isDevMode: true,
      signIn,
      signOut,
    }),
    [token, signIn, signOut],
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

// --- The provider ----------------------------------------------------------

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  if (!AUTHORITY || !CLIENT_ID) {
    // In a production build this is a misconfiguration, not a dev convenience.
    // Falling through to DevBridge would show a token prompt that cannot work:
    // the API stops accepting the dev token the moment a pool is configured
    // server-side, so every attempt would 401 with no explanation on screen.
    if (import.meta.env.PROD) {
      return <AdminAuthContext.Provider value={UNCONFIGURED}>{children}</AdminAuthContext.Provider>
    }
    return <DevBridge>{children}</DevBridge>
  }

  return (
    <AuthProvider
      authority={AUTHORITY}
      client_id={CLIENT_ID}
      redirect_uri={`${window.location.origin}/admin`}
      post_logout_redirect_uri={`${window.location.origin}/`}
      response_type="code"
      scope="openid email"
      // Strip ?code=&state= after the exchange, so a refresh doesn't retry a
      // one-time code and land on an error.
      onSigninCallback={() => {
        window.history.replaceState({}, document.title, window.location.pathname)
      }}
    >
      <CognitoBridge>{children}</CognitoBridge>
    </AuthProvider>
  )
}
