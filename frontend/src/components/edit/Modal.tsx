// The overlay every editing dialog sits in — the same frame as the suggestion
// dialog (components/submissions/SubmissionDialog.tsx). Escape closes it.

import { useEffect, useId, type ReactNode } from 'react'

export default function Modal({
  title,
  onClose,
  children,
  wide = false,
  'data-cy': dataCy,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  'data-cy'?: string
}) {
  const titleId = useId()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div
        data-cy={dataCy}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl bg-white p-6 shadow-xl`}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="cursor-pointer rounded-full px-2 text-xl leading-none text-gray-400 hover:text-gray-700"
          >
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
