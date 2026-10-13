// The ISA sign-in itself — react-oidc-context + oidc-client-ts, ~60 KB raw.
//
// Loaded lazily by AuthContext.tsx, and only when it is needed: someone
// presses "Sign in", the page is the redirect back from the ISA, or the tab
// already holds a session (D41). Rendered BESIDE the app rather than around it,
// so loading it never remounts the page underneath.

import { useEffect, useRef } from 'react'
import { AuthProvider, useAuth } from 'react-oidc-context'
import { AUTHORITY, CLIENT_ID, LOGIN_DOMAIN } from './config'

export interface IsaState {
  token: string | null
  isLoading: boolean
  error: string | null
}

export interface IsaActions {
  signIn: () => void
  signOut: () => void
}

interface Props {
  onState: (state: IsaState) => void
  onActions: (actions: IsaActions) => void
  /** The redirect back from the ISA has been processed (or failed). */
  onCallbackDone: () => void
  /** Start a sign-in as soon as the library is ready — the click that loaded it. */
  signInOnLoad: boolean
}

function Bridge({ onState, onActions, signInOnLoad }: Omit<Props, 'onCallbackDone'>) {
  const auth = useAuth()
  const started = useRef(false)

  useEffect(() => {
    onState({
      // The API verifies the ID token (`token_use === 'id'`), not the access
      // token — sending the wrong one is a 401 that looks like a sign-in bug.
      token: auth.user?.id_token ?? null,
      isLoading: auth.isLoading,
      error: auth.error?.message ?? null,
    })
  }, [auth.user, auth.isLoading, auth.error, onState])

  useEffect(() => {
    onActions({
      signIn: () => void auth.signinRedirect(),
      signOut: () => {
        void auth.removeUser().then(() => {
          // Also end the session at the ISA's hosted sign-in, or the next
          // "Sign in" would silently sign the same person straight back in.
          // `logout_uri` must be one of the client's registered sign-out URLs:
          // the bare origin (D61).
          if (LOGIN_DOMAIN && CLIENT_ID) {
            const url = new URL(`https://${LOGIN_DOMAIN}/logout`)
            url.searchParams.set('client_id', CLIENT_ID)
            url.searchParams.set('logout_uri', window.location.origin)
            window.location.assign(url.toString())
          }
        })
      },
    })
  }, [auth, onActions])

  useEffect(() => {
    if (signInOnLoad && !started.current && !auth.isLoading && !auth.isAuthenticated) {
      started.current = true
      void auth.signinRedirect()
    }
  }, [signInOnLoad, auth])

  return null
}

export default function IsaSession(props: Props) {
  return (
    <AuthProvider
      authority={AUTHORITY!}
      client_id={CLIENT_ID!}
      // The bare origin, exactly as registered on the ISA's app client (D61).
      redirect_uri={window.location.origin}
      post_logout_redirect_uri={window.location.origin}
      response_type="code"
      scope="openid email"
      onSigninCallback={() => {
        // Strip ?code=&state= so a refresh does not retry a one-time code.
        window.history.replaceState({}, document.title, window.location.pathname)
        props.onCallbackDone()
      }}
    >
      <Bridge onState={props.onState} onActions={props.onActions} signInOnLoad={props.signInOnLoad} />
    </AuthProvider>
  )
}
