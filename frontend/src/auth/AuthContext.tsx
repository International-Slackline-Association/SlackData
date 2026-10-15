// Site-wide sign-in through the ISA account (LIVE_EDITING_PLAN.md § 4.2).
//
// Eager and small: the context, the dev mode, and the decision of WHEN to load
// the OIDC library — which itself is lazy (IsaSession.tsx) so that anonymous
// visitors download nothing extra (D41).
//
// Once a token exists, `GET /me` says who SlackData thinks this is and what
// they may do. Roles come from the server's people store on every request,
// never from the token, so nothing here is access control: hiding a page is
// cosmetic, and the API refuses what the role does not allow.

import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { acknowledgeNotice, changeName, fetchMe } from '@/api/people'
import type { Me } from '@/types'
import {
  DEV_TOKEN_KEY,
  authMode,
  hasStoredSession,
  isSignInCallback,
  rememberReturnTo,
  takeReturnTo,
} from './config'
import type { IsaActions, IsaState } from './IsaSession'

const IsaSession = lazy(() => import('./IsaSession'))

export interface SiteAuth {
  mode: ReturnType<typeof authMode>
  token: string | null
  /** Who the API says this is. Null until fetched, or when signed out. */
  me: Me | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  isAdmin: boolean
  /** May this person change gear of this brand — an admin, or one of its
   *  manufacturers (phase 5)? The API decides again on every save. */
  canEditBrand: (brandName: string | null | undefined) => boolean
  /** Has this person any editing rights at all (admin, or any brand)? */
  canEditAny: boolean
  /** Sign in, then come back to `returnTo` (default: this page). */
  signIn: (returnTo?: string) => void
  signOut: () => void
  /** Acknowledge the sign-in notice, saving the name typed into it. */
  acknowledgeNotice: (name: string) => Promise<void>
  changeName: (name: string) => Promise<void>
}

const AuthContext = createContext<SiteAuth | undefined>(undefined)

export function useSiteAuth(): SiteAuth {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useSiteAuth must be used inside <SiteAuthProvider>')
  return value
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function readDevToken(): string | null {
  try {
    return sessionStorage.getItem(DEV_TOKEN_KEY)
  } catch {
    return null
  }
}

/** Local dev / Cypress: a token in sessionStorage, mirroring ADMIN_DEV_TOKEN. */
function useDevToken(enabled: boolean) {
  const [token, setToken] = useState<string | null>(() => (enabled ? readDevToken() : null))

  // Cypress sets the token before visiting, but a spec may also set it while
  // the page is open. Storage events cover other tabs; the interval covers
  // this one, cheaply, because there is no event for same-document writes.
  useEffect(() => {
    if (!enabled) return
    const sync = () => setToken(current => (current === readDevToken() ? current : readDevToken()))
    window.addEventListener('storage', sync)
    const timer = window.setInterval(sync, 500)
    return () => {
      window.removeEventListener('storage', sync)
      window.clearInterval(timer)
    }
  }, [enabled])

  const signIn = useCallback(() => {
    const entered = window.prompt('Admin token (local development only)')
    if (entered) {
      sessionStorage.setItem(DEV_TOKEN_KEY, entered)
      setToken(entered)
    }
  }, [])

  const signOut = useCallback(() => {
    sessionStorage.removeItem(DEV_TOKEN_KEY)
    setToken(null)
  }, [])

  return { token, signIn, signOut }
}

export function SiteAuthProvider({ children }: { children: ReactNode }) {
  const mode = authMode()
  const navigate = useNavigate()
  const dev = useDevToken(mode === 'dev')

  // --- ISA mode: load the library only when it is needed ---------------------
  const [callbackPending, setCallbackPending] = useState(() => mode === 'isa' && isSignInCallback())
  const [loadIsa, setLoadIsa] = useState(() => mode === 'isa' && (callbackPending || hasStoredSession()))
  const [signInOnLoad, setSignInOnLoad] = useState(false)
  const [isa, setIsa] = useState<IsaState>({ token: null, isLoading: loadIsa, error: null })
  const actions = useRef<IsaActions | null>(null)

  const onActions = useCallback((value: IsaActions) => {
    actions.current = value
  }, [])

  const onCallbackDone = useCallback(() => {
    setCallbackPending(false)
    navigate(takeReturnTo(), { replace: true })
  }, [navigate])

  // A failed callback (state mismatch, a denied consent) never reaches
  // onSigninCallback. Stop holding the page, and show the error where it is.
  useEffect(() => {
    if (callbackPending && isa.error) {
      setCallbackPending(false)
      window.history.replaceState({}, document.title, window.location.pathname)
      navigate(takeReturnTo(), { replace: true })
    }
  }, [callbackPending, isa.error, navigate])

  const token = mode === 'isa' ? isa.token : mode === 'dev' ? dev.token : null

  // --- Who the API says this is ----------------------------------------------
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setMe(null)
      setMeError(null)
      return
    }
    let cancelled = false
    fetchMe(token)
      .then(value => {
        if (!cancelled) {
          setMe(value)
          setMeError(null)
        }
      })
      .catch(caught => {
        if (cancelled) return
        setMe(null)
        setMeError(
          caught instanceof ApiError ? `${caught.status}: ${caught.message}` : 'Could not reach the API.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const signIn = useCallback(
    (returnTo?: string) => {
      if (mode === 'dev') {
        dev.signIn()
        return
      }
      if (mode !== 'isa') return
      rememberReturnTo(returnTo ?? currentPath())
      if (actions.current) {
        actions.current.signIn()
      } else {
        setSignInOnLoad(true)
        setLoadIsa(true)
      }
    },
    [mode, dev],
  )

  const signOut = useCallback(() => {
    setMe(null)
    if (mode === 'dev') dev.signOut()
    else actions.current?.signOut()
  }, [mode, dev])

  const acknowledge = useCallback(
    async (name: string) => {
      if (!token) return
      setMe(await acknowledgeNotice(token, name))
    },
    [token],
  )

  const rename = useCallback(
    async (name: string) => {
      if (!token) return
      setMe(await changeName(token, name))
    },
    [token],
  )

  const value = useMemo<SiteAuth>(
    () => ({
      mode,
      token,
      me,
      isAuthenticated: Boolean(token),
      isLoading: mode === 'isa' && (isa.isLoading || callbackPending),
      error:
        mode === 'unconfigured'
          ? 'Sign-in is not configured for this deployment. VITE_ISA_AUTHORITY and VITE_ISA_CLIENT_ID must be set at build time.'
          : (isa.error ?? meError),
      isAdmin: Boolean(me?.roles.includes('admin')),
      canEditBrand: (brandName: string | null | undefined) =>
        Boolean(me?.roles.includes('admin')) || Boolean(brandName && me?.brands?.some(b => b.name === brandName)),
      canEditAny: Boolean(me?.roles.includes('admin')) || Boolean(me?.brands?.length),
      signIn,
      signOut,
      acknowledgeNotice: acknowledge,
      changeName: rename,
    }),
    [mode, token, me, isa, callbackPending, meError, signIn, signOut, acknowledge, rename],
  )

  return (
    <AuthContext.Provider value={value}>
      {loadIsa && (
        <Suspense fallback={null}>
          <IsaSession
            onState={setIsa}
            onActions={onActions}
            onCallbackDone={onCallbackDone}
            signInOnLoad={signInOnLoad}
          />
        </Suspense>
      )}
      {/*
        The redirect back from the ISA lands on the bare origin with ?code=.
        Holding the page until it is processed is what stops the index route's
        <Navigate> from discarding the code before the library has read it.
      */}
      {callbackPending ? (
        <p data-cy="signing-in" className="p-8 text-sm text-gray-600">
          Signing in…
        </p>
      ) : (
        children
      )}
    </AuthContext.Provider>
  )
}
