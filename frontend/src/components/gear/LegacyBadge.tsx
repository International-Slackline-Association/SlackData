// Lifecycle pill: renders only for gear we know is no longer sold
// (`active === false`). Active and unknown-status gear render nothing, so the
// badge always means "discontinued" and never "unverified".
//
// One component for every surface — the listing card (absolutely positioned
// over the image), the Detailed-view panel and the standalone detail page (both
// inline next to the product name) — so the colors can't drift apart.

export default function LegacyBadge({
  active,
  className = '',
}: {
  active: unknown
  className?: string
}) {
  if (active !== false) return null
  return (
    <span
      data-cy="legacy-badge"
      className={`rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm ${className}`}
    >
      Legacy
    </span>
  )
}
