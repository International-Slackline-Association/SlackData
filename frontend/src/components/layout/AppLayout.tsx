// App shell: persistent top nav + routed page content.

import { Outlet } from 'react-router-dom'
import TopNav from './TopNav'

export default function AppLayout() {
  return (
    <div className="min-h-screen" style={{ background: '#F8F7F4' }}>
      <TopNav />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
