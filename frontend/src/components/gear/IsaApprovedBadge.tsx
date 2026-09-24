// The ISA "Approved" stamp — the ONLY representation of certification
// (isa_certification.cy.ts requires this specific badge, not a plain checkmark
// or text pill).
//
// Shows the ISA's official stamp PNG for the item's certificate
// (`utils/isaStamp.ts`: `ISA:41` + class `A+` → `ISA41Aplus.png`). Anything
// without a file, and any image that fails to load, falls back to the drawn
// stamp — charcoal frame, teal check, coral accent — so a missing PNG never
// blanks the certification.

import { useState } from 'react'
import { isaStampPath } from '@/utils/isaStamp'

type Size = 'card' | 'detail'

// The PNGs are square. On a card the stamp reads as the ISA mark (the letter
// bubble beside it carries the class); on the detail page it is large enough
// for the certificate line to be legible.
const IMG_SIZE: Record<Size, string> = {
  // 60px: the stamp is the trust signal, and at 40px its lettering was mush.
  card: 'h-15 w-15',
  detail: 'h-28 w-28',
}

export default function IsaApprovedBadge({
  certificate = null,
  isaClass = null,
  size = 'card',
  className = '',
}: {
  certificate?: string | null
  isaClass?: string | null
  size?: Size
  className?: string
}) {
  const src = isaStampPath(certificate, isaClass)
  // Keyed on the path, so a card reused for another item retries its image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (src && failedSrc !== src) {
    const label = certificate ? `ISA Approved — ${certificate}` : 'ISA Approved'
    return (
      <img
        data-cy="isa-approved-badge"
        data-isa-stamp={src}
        src={src}
        alt={label}
        title={label}
        loading="lazy"
        onError={() => setFailedSrc(src)}
        className={`${IMG_SIZE[size]} object-contain drop-shadow-sm ${className}`}
      />
    )
  }

  return (
    <div
      data-cy="isa-approved-badge"
      title="ISA Approved"
      className={`inline-flex items-center gap-1 rounded-md border-2 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide shadow-sm ${size === 'detail' ? 'scale-125 origin-left' : ''} ${className}`}
      style={{ borderColor: '#2f3640' }}
    >
      <span style={{ color: '#00897B' }} aria-hidden>✓</span>
      <span style={{ color: '#2f3640' }}>ISA</span>
      <span style={{ color: '#D04A3E' }}>Approved</span>
    </div>
  )
}
