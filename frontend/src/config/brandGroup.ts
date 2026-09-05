// The Brand filter group — declared apart from FILTER_GROUPS so it can be
// imported by the node unit tests, which have no `@/` alias resolver and so
// cannot load filterGroups.ts (it imports WEBLOCK_STYLES at runtime). Everything
// here is config; filterGroups.ts spreads it into all eight gear types and
// re-exports it, so `filterGroups` stays the one place a sidebar is described.

import type { FilterGroupMeta } from './filterGroups'

// Brand — the same group on every gear type, so it is declared once and spread
// into each list rather than retyped eight times.
//
// `valueField` is why it is a group at all rather than a filter on `brand_name`:
// the values compared are the derived `brands` array the listing attaches (the
// maker plus every brand co-listing the item — see utils/sellers.ts), while the
// URL key and data-group stay the singular `brand` the sidebar reads. Picking
// "Spider Slacklines" therefore returns what Spider makes AND what Spider
// stocks. See DESIGN.md § Left Filter Sidebar.
//
// `searchable` because webbings alone come from 45 brands; the sidebar folds
// the list and offers a search box above PILL_FOLD_THRESHOLD options.
export const BRAND_GROUP: FilterGroupMeta = {
  group: 'brand',
  label: 'Brand',
  type: 'pill',
  pillKind: 'enum',
  valueField: 'brands',
  searchable: true,
}
