// A seed `description` is the maker's blurb, verbatim — optionally followed by
// OUR editorial note, set off as a final paragraph starting "Note:" (i.e. after
// "\n\nNote: "). The page renders that note apart from the blurb, in red, so a
// reader never mistakes our words for the maker's.
//
// Both halves are plain text, with one exception: an internal link
// written as `[text](/path)`, so an editor's note can point at another catalogue
// page (e.g. "this is Landcruising's [Core 2 HS](/webbings/1)"). Only paths
// starting with a single "/" become links — an external URL or anything else in
// brackets stays text, so a maker's blurb can never smuggle in an off-site link.

export type DescriptionPart = { text: string; to?: string }

const LINK = /\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g

export function descriptionParts(description: string): DescriptionPart[] {
  const parts: DescriptionPart[] = []
  let last = 0
  for (const m of description.matchAll(LINK)) {
    if (m.index > last) parts.push({ text: description.slice(last, m.index) })
    parts.push({ text: m[1], to: m[2] })
    last = m.index + m[0].length
  }
  if (last < description.length) parts.push({ text: description.slice(last) })
  return parts
}

const NOTE = '\n\nNote: '

export function splitDescription(description: string): { blurb: string; note: string | null } {
  const at = description.lastIndexOf(NOTE)
  if (at === -1) return { blurb: description, note: null }
  return { blurb: description.slice(0, at), note: description.slice(at + 2) }
}
