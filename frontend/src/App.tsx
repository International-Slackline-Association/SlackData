// Route table. Route ranking (not JSX order) resolves overlaps: the static
// segments `/manufacturers` and `:slug/compare` outrank the dynamic `:slug`
// and `:slug/:id` patterns — so `/manufacturers/:id` (brand detail) wins over
// `:slug/:id` (gear detail) for a URL like /manufacturers/7.

import { Navigate, Route, Routes } from 'react-router-dom'
import { CurrencyProvider } from '@/context/CurrencyContext'
import AppLayout from '@/components/layout/AppLayout'
import GearListingPage from '@/pages/GearListingPage'
import GearDetailPage from '@/pages/GearDetailPage'
import ComparePage from '@/pages/ComparePage'
import ManufacturersPage from '@/pages/ManufacturersPage'
import BrandDetailPage from '@/pages/BrandDetailPage'
import NotFoundPage from '@/pages/NotFoundPage'
import './index.css'

export default function App() {
  return (
    // Inside the router — the provider reads ?cur= from the URL. Outside every
    // page, because the display currency is site-wide: the nav selector and the
    // listing, detail and compare views all read the same one.
    <CurrencyProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/webbings" replace />} />
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
