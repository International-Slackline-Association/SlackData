// Site footer: the two standing notices, on every page.
//
// Source text: SAFETY_AND_ACCURACY.md §A1 and §B1. Both notices are rendered
// through their shared components so the footer can't drift from the copy shown
// on the detail and listing pages.

import SafetyNotice from './SafetyNotice'
import DataAccuracyNote from './DataAccuracyNote'

export default function SiteFooter() {
  return (
    <footer
      data-cy="site-footer"
      className="mt-16 border-t border-gray-200 bg-white px-6 py-8"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2">
        <SafetyNotice variant="footer" />
        <DataAccuracyNote variant="footer" />
      </div>
    </footer>
  )
}
