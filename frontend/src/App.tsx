// Route table. Route ranking (not JSX order) resolves overlaps: the static
// segments `/manufacturers`, `/safety`, `/admin` and `:slug/compare` outrank the dynamic
// `:slug` and `:slug/:id` patterns — so `/manufacturers/:id` (brand detail) wins
// over `:slug/:id` (gear detail) for a URL like /manufacturers/7, and `/safety`
// resolves to the safety page rather than being read as a gear-type slug.

import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { CurrencyProvider } from '@/context/CurrencyContext'
import AppLayout from '@/components/layout/AppLayout'
import GearListingPage from '@/pages/GearListingPage'
import GearDetailPage from '@/pages/GearDetailPage'
import ComparePage from '@/pages/ComparePage'
import ManufacturersPage from '@/pages/ManufacturersPage'
import BrandDetailPage from '@/pages/BrandDetailPage'
import SafetyPage from '@/pages/SafetyPage'
import NotFoundPage from '@/pages/NotFoundPage'

// Lazy, so react-oidc-context + oidc-client-ts stay out of the chunk every
// visitor downloads — see AdminRoute.tsx. `index.css` is imported once, by
// main.tsx; importing it here as well was harmless but told two stories about
// where the stylesheet enters the graph.
const AdminRoute = lazy(() => import('@/pages/AdminRoute'))

export default function App() {
  return (
    // Inside the router — the provider reads ?cur= from the URL. Outside every
    // page, because the display currency is site-wide: the nav selector and the
    // listing, detail and compare views all read the same one.
    <CurrencyProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/webbings" replace />} />
          <Route path="safety" element={<SafetyPage />} />
          {/*
            Static, so it outranks the `:slug` gear-type pattern — /admin must
            not be read as a gear type.

            Gated on VITE_ENABLE_SUBMISSIONS so a build with Phase 2 off drops
            the route entirely and /admin falls through to NotFound. It is set
            in BOTH .env.development and .env.production — the hosted site does
            ship /admin, and what keeps that harmless is not this flag: the page
            renders "sign-in is not configured" until the Cognito values are
            filled in (infra/README.md § Turning Phase 2 on), and every endpoint
            behind it is guarded server-side by require_admin
            (slack_data/api/auth.py). A release gate, never access control.
          */}
          {import.meta.env.VITE_ENABLE_SUBMISSIONS === 'true' && (
            <Route
              path="admin"
              element={
                // The fallback is deliberately plain: this chunk is fetched only
                // by an administrator, on a fast path, and a spinner that flashes
                // for 80ms reads worse than nothing.
                <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading…</div>}>
                  <AdminRoute />
                </Suspense>
              }
            />
          )}
          <Route path="manufacturers" element={<ManufacturersPage />} />
          <Route path="manufacturers/:id" element={<BrandDetailPage />} />
          <Route path=":slug/compare" element={<ComparePage />} />
          <Route path=":slug/:id" element={<GearDetailPage />} />
          <Route path=":slug" element={<GearListingPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </CurrencyProvider>
  )
}
