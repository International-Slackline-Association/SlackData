// The change log, rendered — one component for an item's History, Recent
// Changes and a person's contributions, so the three can never describe the
// same record three ways. Public (D3, D33): no sign-in needed to read it.
//
// `onRevert`, when given, adds a Revert button to each edit (admins, D58).

import { Link } from 'react-router-dom'
import type { ChangeRecordPublic } from '@/types'
import { display, humanize } from '@/utils/fieldDraft'
import { addedPhotos, describeMediaChange, MEDIA_FIELDS } from '@/utils/mediaChanges'
import { mediaUrl, useMedia } from '@/utils/mediaStore'

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
  'brand.link': 'linked a brand to',
  'brand.unlink': 'unlinked a brand from',
  'key.create': 'created an API key for',
  'key.regenerate': 'gave a new secret to an API key of',
  'key.revoke': 'revoked an API key of',
}

const REVERTIBLE = new Set(['item.edit', 'item.revert'])

/** Where a record's target lives on the site, if anywhere. Labelled by what
 *  it is called now (`target_name`), falling back to its id only when the API
 *  knows no name. */
function targetLink(record: ChangeRecordPublic): { to: string; label: string } | null {
  const name = record.target_name
  if (record.target_type === 'item') {
    const [collection, id] = record.target_id.split('#')
    return { to: `/${collection}/${id}`, label: name ?? `${collection.replace(/s$/, '')} #${id}` }
  }
  if (record.target_type === 'brand') return { to: `/manufacturers/${record.target_id}`, label: name ?? `brand #${record.target_id}` }
  if (record.target_type === 'person') return { to: `/people/${record.target_id}`, label: name ?? record.target_id }
  return null
}

/** An edit that changed the name reads as a rename: "renamed X to Y". */
function rename(record: ChangeRecordPublic): { from: string; to: string } | null {
  const change = record.changes.name
  if (!change || (record.action !== 'item.edit' && record.action !== 'item.revert')) return null
  if (typeof change.before !== 'string' || typeof change.after !== 'string') return null
  return { from: change.before, to: change.after }
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
        const renamed = showTarget ? rename(record) : null
        return (
          <li key={record.id} data-cy="change-row" data-action={record.action} className="py-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {record.actor_isa_id.startsWith('KEY_') ? (
                // A brand's API key, not a person: nothing to link to.
                <span data-cy="change-actor" className="font-medium text-gray-900">
                  {record.actor_name}
                </span>
              ) : (
                <Link
                  to={`/people/${record.actor_isa_id}`}
                  data-cy="change-actor"
                  className="font-medium text-gray-900 hover:text-teal-700 hover:underline"
                >
                  {record.actor_name}
                </Link>
              )}
              <span className="text-xs text-gray-500">({record.actor_role})</span>
              {renamed ? (
                <span data-cy="change-rename" className="text-gray-700">
                  renamed {renamed.from} to{' '}
                  {target ? (
                    <Link data-cy="change-target" to={target.to} className="text-teal-700 hover:underline">
                      {renamed.to}
                    </Link>
                  ) : (
                    renamed.to
                  )}
                </span>
              ) : (
                <>
                  <span className="text-gray-700">{ACTION_TEXT[record.action] ?? record.action}</span>
                  {showTarget &&
                    (target ? (
                      <Link data-cy="change-target" to={target.to} className="text-teal-700 hover:underline">
                        {target.label}
                      </Link>
                    ) : (
                      <span className="text-gray-700">{record.target_name ?? record.target_id}</span>
                    ))}
                </>
              )}
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
                {Object.entries(record.changes).map(([field, change]) =>
                  MEDIA_FIELDS.has(field) ? (
                    <MediaChange key={field} field={field} before={change.before} after={change.after} />
                  ) : (
                    <li key={field}>
                      <span className="font-medium text-gray-700">{humanize(field)}</span>:{' '}
                      <span className="line-through">{display(change.before, field)}</span> → {display(change.after, field)}
                    </li>
                  ),
                )}
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

/** A photo, manual or logo change: what happened, and the photos it added. */
function MediaChange({ field, before, after }: { field: string; before: unknown; after: unknown }) {
  useMedia() // the base URL for the thumbnails
  const added = field === 'photos' ? addedPhotos(before, after).slice(0, 6) : []
  return (
    <li data-cy="change-media" data-field={field}>
      <span className="font-medium text-gray-700">{humanize(field)}</span>: {describeMediaChange(field, before, after)}
      {added.length > 0 && (
        <span className="mt-1 flex gap-1">
          {added.map(photo => (
            <img key={photo.id} src={mediaUrl(String(photo.small))} alt="" loading="lazy" className="h-10 w-10 rounded border border-gray-200 object-contain" />
          ))}
        </span>
      )}
      {field === 'logo' && typeof after === 'string' && (
        <img src={mediaUrl(after)} alt="" loading="lazy" className="mt-1 h-8 max-w-24 object-contain" />
      )}
    </li>
  )
}
