// One person's contributions — every change they made, newest first, public
// (D3). Their name is looked up now, never stored with a change (D43), so a
// rename or an anonymisation shows on every record.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchChanges } from '@/api/people'
import ChangeList from '@/components/edit/ChangeList'
import type { ChangeRecordPublic } from '@/types'

export default function ContributionsPage() {
  const { isaId = '' } = useParams()
  const [records, setRecords] = useState<ChangeRecordPublic[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setRecords(null)
    fetchChanges({ actor: isaId, limit: 100 })
      .then(page => {
        if (!cancelled) setRecords(page)
      })
      .catch(() => {
        if (!cancelled) setRecords([])
      })
    return () => {
      cancelled = true
    }
  }, [isaId])

  const name = records?.[0]?.actor_name ?? isaId
  return (
    <div data-cy="contributions-page" className="mx-auto max-w-4xl">
      <h1 data-cy="contributions-name" className="text-2xl font-semibold text-gray-900">
        {name}
      </h1>
      <p className="mt-1 text-sm text-gray-600">ISA account {isaId} — every change they made on SlackData.</p>
      <div className="mt-4 rounded-xl border border-gray-200 bg-white px-6 py-2 shadow-sm">
        {records === null ? (
          <p className="py-4 text-sm text-gray-400">Loading…</p>
        ) : (
          <ChangeList records={records} emptyText="No changes yet." />
        )}
      </div>
    </div>
  )
}
