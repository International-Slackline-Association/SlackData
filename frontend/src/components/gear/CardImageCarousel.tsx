// Every image we hold for a product, browsable in place on the card.
//
// Contract (gear_cards.cy.ts § Card image carousel): one [data-cy="card-image-dot"]
// per image with data-active on the current one, plus card-image-prev /
// card-image-next which wrap in both directions. A single-image product renders
// the bare <img> with no chrome at all — dots and arrows must not exist.
//
// The dot count always equals the manifest's image count, even if a file fails
// to load: a broken image swaps its own slot for the placeholder rather than
// dropping out of the set, so the carousel's length never contradicts
// data-image-count on the image area.

import { useState } from 'react'

// Arrows sit at rest rather than appearing on hover: a hidden control is
// undiscoverable, and an opacity-0 element is un-clickable in Cypress without
// force: true, which would make the carousel tests weaker than the feature.
const arrowBtn =
  'absolute top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full ' +
  'bg-white/70 text-base leading-none text-gray-500 shadow-sm transition-colors ' +
  'hover:bg-white hover:text-gray-900 group-hover:bg-white/90'

// `imgDataCy` lets the detail-page body claim its own hook (detail-img) on the
// visible image while sharing the carousel wholesale with the cards.
export default function CardImageCarousel({
  urls,
  alt,
  imgDataCy = 'gear-card-img',
}: {
  urls: string[]
  alt: string
  imgDataCy?: string
}) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<Set<string>>(new Set())

  if (urls.length === 0) {
    return <span className="text-xs text-gray-300">No image</span>
  }

  const current = urls[index]
  const step = (delta: number) => setIndex(i => (i + delta + urls.length) % urls.length)

  return (
    <>
      {failed.has(current) ? (
        <span className="text-xs text-gray-300">No image</span>
      ) : (
        <img
          data-cy={imgDataCy}
          src={current}
          alt={alt}
          loading="lazy"
          // object-cover (not contain) so the photo fills the image area top to
          // bottom — product shots carry a lot of dead white space, and
          // letterboxing them left grey bands above and below. Crops the long
          // axis; these are centered product shots, so the subject survives.
          className="h-full w-full object-cover"
          onError={() => setFailed(prev => new Set(prev).add(current))}
        />
      )}

      {urls.length > 1 && (
        <>
          <button
            data-cy="card-image-prev"
            type="button"
            aria-label="Previous image"
            onClick={() => step(-1)}
            className={`${arrowBtn} left-1`}
          >
            ‹
          </button>
          <button
            data-cy="card-image-next"
            type="button"
            aria-label="Next image"
            onClick={() => step(1)}
            className={`${arrowBtn} right-1`}
          >
            ›
          </button>

          <div className="absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1">
            {urls.map((url, i) => (
              <button
                key={url}
                data-cy="card-image-dot"
                data-active={String(i === index)}
                type="button"
                aria-label={`Image ${i + 1} of ${urls.length}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === index ? 'bg-gray-700' : 'bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}
