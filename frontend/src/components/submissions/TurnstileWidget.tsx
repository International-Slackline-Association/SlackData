// Cloudflare Turnstile — the captcha on the public submission form.
//
// Loaded from Cloudflare's CDN rather than bundled, because the widget's script
// is the only thing that can mint a token and it must be the current version.
// The script is fetched **once per page load and only when a site key is set**,
// so local dev and the Cypress suite never touch the network: with no key this
// component renders nothing and `isCaptchaRequired()` is false.
//
// The server is the real check. A token is redeemed against Cloudflare in
// slack_data/utilities/turnstile.py, which fails closed. Everything here is to
// get a token into that request — nothing in this file is a security control,
// and a bot that skips it entirely still meets the server-side verification.

import { useEffect, useRef } from 'react'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** True when the form must carry a captcha token for the server to accept it. */
export function isCaptchaRequired(): boolean {
  return Boolean(SITE_KEY)
}

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      theme?: 'light' | 'dark' | 'auto'
    },
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

// Module-level, so opening the dialog a second time reuses the loaded script
// instead of appending another <script> tag.
let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      scriptPromise = null
      reject(new Error('could not load the Turnstile script'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export default function TurnstileWidget({
  onToken,
  onError,
}: {
  /** Called with a fresh token, and with null whenever the old one stops being valid. */
  onToken: (token: string | null) => void
  onError: (message: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  // Kept in refs so the render effect does not re-run when the parent re-renders
  // on every keystroke — re-rendering the widget would discard a solved token.
  const onTokenRef = useRef(onToken)
  const onErrorRef = useRef(onError)
  onTokenRef.current = onToken
  onErrorRef.current = onError

  useEffect(() => {
    if (!SITE_KEY) return

    let widgetId: string | undefined
    let cancelled = false

    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return
        widgetId = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          callback: token => onTokenRef.current(token),
          // Tokens are single-use and time-limited. Clearing on expiry means a
          // form left open for ten minutes fails the friendly client-side check
          // rather than being refused by the server after the user hits send.
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => {
            onTokenRef.current(null)
            onErrorRef.current('The captcha could not load. Please try again.')
          },
          theme: 'light',
        })
      })
      .catch(() => {
        if (!cancelled) {
          onErrorRef.current('The captcha could not load. Please check your connection.')
        }
      })

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [])

  if (!SITE_KEY) return null

  return <div ref={container} data-cy="turnstile-widget" className="mt-4" />
}
