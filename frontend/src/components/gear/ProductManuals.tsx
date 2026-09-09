// "Manuals & documents" — the PDFs a manufacturer publishes about a product:
// user manuals, datasheets, product archives. DESIGN.md § Manuals & documents.
//
// Two things at once, and both are load-bearing:
//
//  1. **A row per document**, titled from its filename ("Product archive", not
//     "landcruise_aeon-product-archive.pdf"), each an `Open ↗` link to the file
//     in a new tab. This is the download, and on any browser that cannot render
//     a PDF inline — mobile Safari, Chrome on Android — it is the whole
//     feature, because it is also the <object>'s fallback content below.
//     A row carrying `appliesTo` is a RANGE-WIDE document — one manual for a
//     maker's whole webbing line — and says so under its title, because
//     "User manual" on a page about one product otherwise claims to be about
//     that product.
//  2. **The first document embedded inline**, so the thing can be read without
//     leaving the page. An <object> rather than an <iframe>: a browser with no
//     PDF viewer substitutes the children instead of rendering a blank frame.
//
// Rendered by GearDetailPage, never by the shared GearDetailBody — the body is
// reused once per item in the listing's Detailed view, and one embedded viewer
// per row there would be absurd (same reasoning as the safety callout).

import type { Manual } from '@/utils/manuals'

export default function ProductManuals({ manuals }: { manuals: Manual[] }) {
  // Absent, not empty: almost nothing in the catalogue has a PDF yet, and a
  // bare heading over nothing reads as a failed fetch.
  if (manuals.length === 0) return null

  return (
    <section
      data-cy="product-manuals"
      className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Manuals &amp; documents
      </h2>

      <ul className="mb-4">
        {manuals.map(manual => (
          <li
            key={manual.file}
            data-cy="manual-listing"
            data-manual={manual.file}
            data-scope={manual.appliesTo ? 'brand' : 'product'}
            className="flex items-center justify-between gap-4 border-b border-gray-100 py-2.5 text-sm last:border-b-0"
          >
            <span className="min-w-0">
              <span className="font-medium text-gray-900">📄 {manual.label}</span>
              {manual.appliesTo && (
                <span data-cy="manual-scope" className="block pl-6 text-xs text-gray-500">
                  {manual.appliesTo}
                </span>
              )}
            </span>
            <a
              data-cy="manual-link"
              href={manual.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-teal-primary hover:underline"
            >
              Open ↗
            </a>
          </li>
        ))}
      </ul>

      <object
        data-cy="manual-embed"
        data={manuals[0].url}
        type="application/pdf"
        aria-label={`${manuals[0].label} (PDF)`}
        className="h-[34rem] w-full rounded-lg border border-gray-200"
      >
        {/* Shown instead of the viewer wherever inline PDFs aren't supported. */}
        <p className="p-4 text-sm text-gray-600">
          This browser can&apos;t show PDFs inline.{' '}
          <a
            href={manuals[0].url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-primary hover:underline"
          >
            Open {manuals[0].label} ↗
          </a>
        </p>
      </object>
    </section>
  )
}
