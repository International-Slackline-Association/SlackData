// Shown for unknown routes and unknown item ids.

import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div data-cy="not-found" className="py-24 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
      <p className="mt-2 text-gray-500">
        We couldn&apos;t find what you were looking for.
      </p>
      <Link
        data-cy="not-found-home-link"
        to="/webbings"
        className="mt-6 inline-block text-teal-primary font-medium"
      >
        ← Back to Webbings
      </Link>
    </div>
  )
}
