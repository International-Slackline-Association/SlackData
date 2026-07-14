// The ISA "Approved" stamp — the ONLY representation of certification
// (isa_certification.cy.ts requires this specific badge, not a plain checkmark
// or text pill). Charcoal frame, teal check, coral accent.

export default function IsaApprovedBadge({ className = '' }: { className?: string }) {
  return (
    <div
      data-cy="isa-approved-badge"
      title="ISA Approved"
      className={`inline-flex items-center gap-1 rounded-md border-2 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide shadow-sm ${className}`}
      style={{ borderColor: '#2f3640' }}
    >
      <span style={{ color: '#00897B' }} aria-hidden>✓</span>
      <span style={{ color: '#2f3640' }}>ISA</span>
      <span style={{ color: '#D04A3E' }}>Approved</span>
    </div>
  )
}
