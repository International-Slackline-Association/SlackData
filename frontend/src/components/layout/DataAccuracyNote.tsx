// The data-accuracy note. Source text: SAFETY_AND_ACCURACY.md §B1.
//
// Shown in the site footer and inline on the listing toolbar, next to the item
// count — the moment a visitor is reading how much data there is is the moment
// to say what that data is worth.
//
// Shares SafetyNotice's shape (one component, two presentations) for the same
// reason: the wording lives in exactly one place.

export default function DataAccuracyNote({
  variant,
  className = '',
}: {
  variant: 'footer' | 'inline'
  className?: string
}) {
  return (
    <span
      data-cy={variant === 'footer' ? 'data-accuracy-footer' : 'data-accuracy-inline'}
      className={
        variant === 'footer'
          ? `text-sm text-gray-600 ${className}`
          : `text-xs text-gray-500 ${className}`
      }
    >
      Data is community-sourced and may be incomplete.
    </span>
  )
}
