// App shell: persistent top nav + routed page content.

import { Outlet } from 'react-router-dom'
import { useCurrency } from '@/context/CurrencyContext'
import TopNav from './TopNav'
import SiteFooter from './SiteFooter'

// Shown when rates are missing or the backend flagged them stale. Prices still
// render — as sold, in each item's own currency — so this explains why the page
// suddenly speaks several currencies instead of one, rather than apologising
// for an error the viewer can't see.
function StaleRatesNotice() {
  return (
    <div
      data-cy="fx-stale-notice"
      className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-xs text-amber-800"
    >
      Live exchange rates are unavailable — prices are shown as sold, in each seller&apos;s currency.
    </div>
  )
}

export default function AppLayout() {
  const { stale } = useCurrency()

  return (
    // flex column so the footer sits at the bottom of the viewport on short
    // pages instead of riding up under the content. `main` needs w-full for its
    // own max-w-7xl mx-auto to keep centring inside the flex parent.
    <div className="flex min-h-screen flex-col" style={{ background: '#F8F7F4' }}>
      <TopNav />
      {stale && <StaleRatesNotice />}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
