// Site footer: the two standing notices, on every page.
//
// Source text: SAFETY_AND_ACCURACY.md §A1 and §B1. Both notices are rendered
// through their shared components so the footer can't drift from the copy shown
// on the detail and listing pages.

import { Link } from 'react-router-dom'
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
        {/*
          The only route into the manufacturer API docs. A brand arrives here
          from a product page having noticed a wrong spec, so the footer — on
          every page — is where the invitation belongs. Not in the top nav:
          that is the gear-type tab bar, and it is for the people browsing.
        */}
        <p data-cy="footer-manufacturer-link" className="text-xs text-gray-500">
          Make slackline gear?{' '}
          {/*
            The click starts at the BOTTOM of whatever page they were reading —
            the footer is the only place this link lives. Client-side navigation
            keeps the scroll offset, so without this the docs open somewhere in
            the middle of the reference and the brand never sees the three-step
            round trip the page is built around.
          */}
          <Link
            to="/for-manufacturers"
            onClick={() => window.scrollTo(0, 0)}
            className="font-medium text-amber-700 underline"
          >
            Keep your own products correct here
          </Link>
          .
        </p>
      </div>
    </footer>
  )
}
