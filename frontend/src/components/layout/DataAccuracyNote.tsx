// The data-accuracy note. Source text: SAFETY_AND_ACCURACY.md §B1.
//
// Site footer only. It used to ALSO sit inline on the listing toolbar, next to
// the item count, on the reasoning that the moment a visitor reads how much data
// there is is the moment to say what it's worth. That reasoning was fine; the
// cost was not. The toolbar is a single flex-wrap row, and this sentence was the
// longest thing on it — it squeezed the search box to ~130px at ~1200px wide and
// pushed the row toward wrapping. The disclaimer is a standing notice, not a
// per-listing one, and the footer is where standing notices live.
//
// Kept as its own component (rather than inlined into SiteFooter) so the wording
// still lives in exactly one place if a second surface ever wants it back.

export default function DataAccuracyNote({ className = '' }: { className?: string }) {
  return (
    <span data-cy="data-accuracy-footer" className={`text-sm text-gray-600 ${className}`}>
      Community-sourced — may be incomplete.
    </span>
  )
}
