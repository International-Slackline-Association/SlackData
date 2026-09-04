// A manufacturer's name, as a link to their page on this site.
// DESIGN.md § Manufacturer names are links.
//
// Drop-in for the bare `{item.brand_name}` it replaced: when the name can't be
// resolved to a brand id — the directory hasn't loaded, or no brand row carries
// that name — it renders exactly the text that was there before. So a card
// never shows a dead link, and never a spinner in place of a brand name.
//
// It inherits its surrounding type (the callers' small-caps gray) rather than
// styling itself: a brand line in teal at rest would out-rank the product name,
// which is the card's real heading.

import { Link, useMatch } from 'react-router-dom'
import { useBrandIndex } from '@/hooks/useBrandIndex'
import { brandHref } from '@/utils/brandLinks'

export default function BrandLink({
  name,
  className = '',
}: {
  name: unknown
  className?: string
}) {
  const index = useBrandIndex()
  // The brand page we may already be on — its own cards must not link back to
  // it. `useMatch` rather than reading the route's params, because BrandLink
  // renders deep inside components that know nothing about the route.
  const onBrandPage = useMatch('/manufacturers/:id')
  const href = brandHref(index, name, onBrandPage?.params.id)
  const text = String(name ?? '')

  if (!href) return <>{text}</>

  return (
    <Link
      data-cy="brand-link"
      data-brand-id={href.slice(href.lastIndexOf('/') + 1)}
      to={href}
      // relative z-10: the gear card lays a stretched overlay link across
      // itself, and an unlifted brand link is unclickable beneath it.
      className={`relative z-10 hover:text-teal-primary hover:underline ${className}`}
    >
      {text}
    </Link>
  )
}
