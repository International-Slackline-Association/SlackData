// The change log, rendered — one component for an item's History, Recent
// Changes and a person's contributions, so the three can never describe the
// same record three ways. Public (D3, D33): no sign-in needed to read it.
//
// `onRevert`, when given, adds a Revert button to each edit (admins, D58).

import { Link } from 'react-router-dom'
import type { ChangeRecordPublic } from '@/types'
import { display, humanize } from '@/utils/fieldDraft'

const ACTION_TEXT: Record<ChangeRecordPublic['action'], string> = {
  'role.grant': 'granted a role',
  'role.revoke': 'revoked a role',
  'item.create': 'created',
  'item.edit': 'edited',
  'item.hide': 'hid',
  'item.unhide': 'unhid',
  'item.merge': 'merged',
  'item.revert': 'reverted a change to',
  'brand.create': 'created brand',
  'brand.edit': 'edited brand',
  'match.repoint': 'moved an ISA match on',
}

const REVERTIBLE = new Set(['item.edit', 'item.revert'])

/** Where a record's target lives on the site, if anywhere. */
function targetLink(record: ChangeRecordPublic): { to: string; label: string } | null {
  if (record.target_type === 'item') {
    const [collection, id] = record.target_id.split('#')
    return { to: `/${collection}/${id}`, label: `${collection.replace(/s$/, '')} #${id}` }
  }
  if (record.target_type === 'brand') return { to: `/manufacturers/${record.target_id}`, label: `brand #${record.target_id}` }
  if (record.target_type === 'person') return { to: `/people/${record.target_id}`, label: record.target_id }
  return null
}

function when(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export default function ChangeList({
  records,
  showTarget = true,
  onRevert,
  emptyText = 'No changes recorded yet.',
}: {
  records: ChangeRecordPublic[]
  showTarget?: boolean
  onRevert?: (record: ChangeRecordPublic) => void
  emptyText?: string
}) {
  if (records.length === 0) {
    return (
      <p data-cy="change-list-empty" className="text-sm text-gray-500">
        {emptyText}
      </p>
    )
  }
  return (
    <ol data-cy="change-list" className="divide-y divide-gray-100">
      {records.map(record => {
        const target = targetLink(record)
        return (
          <li key={record.id} data-cy="change-row" data-action={record.action} className="py-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Link
                to={`/people/${record.actor_isa_id}`}
                data-cy="change-actor"
                className="font-medium text-gray-900 hover:text-teal-700 hover:underline"
              >
                {record.actor_name}
              </Link>
              <span className="text-xs text-gray-500">({record.actor_role})</span>
              <span className="text-gray-700">{ACTION_TEXT[record.action] ?? record.action}</span>
              {showTarget &&
                (target ? (
                  <Link to={target.to} className="text-teal-700 hover:underline">
                    {target.label}
                  </Link>
                ) : (
                  <span className="text-gray-700">{record.target_id}</span>
                ))}
              {record.flags.includes('safety') && (
                <span data-cy="change-safety" className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                  breaking strength
                </span>
              )}
              {record.channel !== 'web' && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">via {record.channel}</span>
              )}
              <time dateTime={record.created_at} className="ml-auto text-xs text-gray-400">
                {when(record.created_at)}
              </time>
            </div>
            {Object.keys(record.changes).length > 0 && (
              <ul className="mt-1 space-y-0.5 pl-1 text-xs text-gray-600">
                {Object.entries(record.changes).map(([field, change]) => (
                  <li key={field}>
                    <span className="font-medium text-gray-700">{humanize(field)}</span>:{' '}
                    <span className="line-through">{display(change.before)}</span> → {display(change.after)}
                  </li>
                ))}
              </ul>
            )}
            {record.why && <p className="mt-1 text-xs text-gray-700">“{record.why}”</p>}
            {onRevert && REVERTIBLE.has(record.action) && (
              <button
                type="button"
                data-cy="change-revert"
                onClick={() => onRevert(record)}
                className="mt-1 cursor-pointer text-xs font-medium text-amber-700 hover:underline"
              >
                Revert this change
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}
