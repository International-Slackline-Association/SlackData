// Route table. Route ranking (not JSX order) resolves overlaps: the static
// segments `/manufacturers` and `:slug/compare` outrank the dynamic `:slug`
// and `:slug/:id` patterns.

import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import GearListingPage from '@/pages/GearListingPage'
import GearDetailPage from '@/pages/GearDetailPage'
import ComparePage from '@/pages/ComparePage'
import ManufacturersPage from '@/pages/ManufacturersPage'
import NotFoundPage from '@/pages/NotFoundPage'
import './index.css'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/webbings" replace />} />
        <Route path="manufacturers" element={<ManufacturersPage />} />
        <Route path=":slug/compare" element={<ComparePage />} />
        <Route path=":slug/:id" element={<GearDetailPage />} />
        <Route path=":slug" element={<GearListingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
