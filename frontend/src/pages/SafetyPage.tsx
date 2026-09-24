// The /safety page. Content is SAFETY_AND_ACCURACY.md §A3, verbatim. The ISA
// certification section is deep-linked from certified detail pages
// (/safety#isa-certification); useScrollRestoration scrolls to the fragment.
//
// Kept as plain JSX rather than rendered markdown: it's one static page, and
// pulling in a markdown renderer to display it would add a dependency and a
// bundle cost for a single route. If more prose pages appear, revisit.

import {
  ISA_APPROVED_GEAR_URL,
  ISA_CERTIFICATION_ANCHOR,
  ISA_STANDARDS_URL,
  ISA_WARNINGS_URL,
} from '@/config/isaLinks'

const extLink = 'font-medium text-teal-primary hover:underline'

function Section({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: React.ReactNode
}) {
  return (
    // scroll-mt clears the sticky top nav when a detail page deep-links here.
    <section id={id} className="mt-8 scroll-mt-[calc(var(--header-h,96px)+1rem)]">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <div className="mt-3 space-y-4 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  )
}

export default function SafetyPage() {
  return (
    <div data-cy="safety-page" className="mx-auto max-w-3xl">
      <article className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Safety</h1>

        <p className="mt-4 text-sm leading-relaxed text-gray-700">
          <strong className="font-semibold text-gray-900">
            Verify every specification with the manufacturer before you rely on it.
          </strong>{' '}
          SlackData is a community reference for comparing gear. It is not a safety authority, an
          inspection service, or a substitute for the manufacturer&apos;s own documentation and
          instructions.
        </p>

        <Section title="What the numbers here do and don't mean">
          <p>
            <strong className="font-semibold text-gray-900">
              Breaking strength is not a working load.
            </strong>{' '}
            Where we list a breaking strength in kN, that is a figure for the product as sold, quoted
            by its manufacturer. It is not a safe working load - those should be found in
            manufacturer instructions. Knots, weblocks, shackles, connectors, edges, wear, water, UV
            exposure, age, and many more factors can all reduce real-world strength.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">Stretch curves are indicative.</strong>{' '}
            They come from manufacturer data gathered under test conditions that are rarely stated
            and rarely comparable between brands. Treat them as a rough guide to how a webbing
            behaves, not as a specification you can calculate against.
          </p>
        </Section>

        <Section id={ISA_CERTIFICATION_ANCHOR} title="ISA certification">
          <p>
            The International Slackline Association (ISA) publishes gear standards for slackline
            equipment, and certifies products tested against them. A product marked{' '}
            <strong className="font-semibold text-gray-900">ISA Approved</strong> here is one we
            have matched to an entry on the ISA&apos;s approved-gear list. Everything else reads{' '}
            <strong className="font-semibold text-gray-900">Not ISA Certified</strong> - including
            products we simply hold no ISA record for.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">
              A certificate covers a specific model and version.
            </strong>{' '}
            Check that the gear in your hands is the one that was certified, and read what each
            standard does and does not cover, on the ISA&apos;s own pages:{' '}
            <a
              data-cy="isa-standards-link"
              href={ISA_STANDARDS_URL}
              target="_blank"
              rel="noreferrer"
              className={extLink}
            >
              ISA gear standards
            </a>{' '}
            and the{' '}
            <a
              data-cy="isa-approved-gear-link"
              href={ISA_APPROVED_GEAR_URL}
              target="_blank"
              rel="noreferrer"
              className={extLink}
            >
              ISA approved-gear list
            </a>
            .
          </p>
        </Section>

        <Section title="Certification and warnings">
          <p>
            SlackData records whether we believe a product is ISA-certified, and whether it is
            subject to an ISA recall, warning, or notice.{' '}
            <strong className="font-semibold text-gray-900">
              This is a periodically-updated copy, not a live feed.
            </strong>
          </p>
          <p>
            <strong className="font-semibold text-gray-900">
              The absence of a certification or warning on this site does not mean one does not
              exist.
            </strong>{' '}
            Our records may be incomplete or out of date, and a product may have been recalled since
            we last updated. Always check the ISA&apos;s own safety database as the authoritative
            source:{' '}
            <a
              data-cy="isa-warnings-link"
              href={ISA_WARNINGS_URL}
              target="_blank"
              rel="noreferrer"
              className={extLink}
            >
              data.slacklineinternational.org/safety/isa-gear-warnings
            </a>
          </p>
        </Section>

        <Section title="Discontinued gear">
          <p>
            SlackData deliberately includes gear that is no longer sold, marked{' '}
            <strong className="font-semibold text-gray-900">Historic</strong>, because knowing what a
            discontinued product was is useful. Its presence here is not a suggestion that it is
            still fit to use. Equipment degrades with age, use, and storage, and older gear may
            predate current standards. Inspect and retire gear according to the manufacturer&apos;s
            guidance, not according to what appears on this site.
          </p>
        </Section>

        <Section title="Slacklining carries risk">
          <p>
            Slacklining, and highlining in particular, can cause serious injury or death. You are
            responsible for your own equipment choices, for inspecting your gear, for how you rig,
            and for the consequences. If you are unsure, get instruction from a qualified person
            rather than a database.
          </p>
        </Section>
      </article>
    </div>
  )
}
