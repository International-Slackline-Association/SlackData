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
//
// The host band must be `relative overflow-hidden` and give this component its
// height — the image is sized off the band, and the blurred backdrop is scaled
// past the band's edges (see below).
//
// **Small first, then large (P4-D).** Every photo is stored at 480 px and
// 1600 px. The image shows the small one; once that has loaded — which, being
// lazy, it only does on screen — the large one is fetched in the background and
// swapped in when it arrives. So a card shows a photo as soon as 480 px of it
// can, and is sharp once the rest lands; a card never scrolled to fetches
// neither. If the large one fails, the small one stays.

import { useState } from 'react'
import type { Photo } from '@/utils/images'

// Arrows sit at rest rather than appearing on hover: a hidden control is
// undiscoverable, and an opacity-0 element is un-clickable in Cypress without
// force: true, which would make the carousel tests weaker than the feature.
// Sized for a thumb (36px) rather than a mouse pointer — see the touch-target
// pass in DESIGN.md § Responsive & Mobile.
const arrowBtn =
  'absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full ' +
  'bg-white/70 text-base leading-none text-gray-500 shadow-sm transition-colors ' +
  'hover:bg-white hover:text-gray-900 group-hover:bg-white/90'

// `imgDataCy` lets the detail-page body claim its own hook (detail-img) on the
// visible image while sharing the carousel wholesale with the cards.
export default function CardImageCarousel({
  photos,
  alt,
  imgDataCy = 'gear-card-img',
}: {
  photos: Photo[]
  alt: string
  imgDataCy?: string
}) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  // Large copies that have finished loading, so may replace their small one.
  const [sharp, setSharp] = useState<Set<string>>(new Set())

  if (photos.length === 0) {
    return <span className="text-xs text-gray-300">No image</span>
  }

  const photo = photos[index]
  const current = sharp.has(photo.large) ? photo.large : photo.small
  const step = (delta: number) => setIndex(i => (i + delta + photos.length) % photos.length)

  // Called when what is shown has loaded: fetch the large copy, if it is not
  // the one shown already, and swap it in once it is here.
  const sharpen = () => {
    if (current === photo.large || photo.large === photo.small) return
    const large = new Image()
    large.onload = () => setSharp(prev => new Set(prev).add(photo.large))
    large.src = photo.large
  }

  return (
    <>
      {failed.has(current) ? (
        <span className="text-xs text-gray-300">No image</span>
      ) : (
        <>
          {/* The photo fits the band by HEIGHT, so a shot narrower than the band
              (all of ours — 0.67–1.54 w/h against a ~2:1 band) leaves bars either
              side. Filling them with a blurred, over-scaled copy of the same file
              gives them the photo's own background colour, so a white product
              shot reads as one white field instead of a picture in a grey gutter.
              Purely decorative — the <img> below carries the alt text. The band
              must clip this (it is scaled past its own edges to push the blur's
              soft border out of frame).
              An <img> and not a CSS background: backgrounds ignore loading=lazy,
              so a 240-card grid would fetch every backdrop up front. Same src as
              the image below, so it costs no extra request.
              The wrapper clips it a second time, with contain-paint: WebKit
              lets a filtered child escape overflow-hidden when it sizes the
              page, so on iOS the bleed past a full-width card made the whole
              page pan sideways. The clip lives here and not on the band because
              contain-paint makes a stacking context, and on the band that would
              sink the arrows and dots beneath the card's full-cover link. */}
          <span aria-hidden="true" className="absolute inset-0 overflow-hidden contain-paint">
            <img
              data-cy="card-image-backdrop"
              aria-hidden="true"
              alt=""
              src={current}
              loading="lazy"
              className="block h-full w-full scale-110 object-cover blur-xl"
            />
          </span>
          <img
            data-cy={imgDataCy}
            data-size={current === photo.large ? 'large' : 'small'}
            src={current}
            alt={alt}
            loading="lazy"
            onLoad={sharpen}
            // contain, NOT cover: the whole photo is fitted inside the band and
            // nothing is cropped. Our shots (0.67–1.54 w/h) are all narrower
            // than the card band (~1.9), so in practice this is a fit by HEIGHT
            // with bars left and right — which is the point. cover fit by WIDTH
            // and sliced the top and bottom off every portrait shot.
            //
            // The box fills the band and object-fit does the letterboxing,
            // rather than `h-full w-auto` sizing the box to the photo: Chromium
            // won't transfer a percentage height through the intrinsic ratio to
            // an auto width — as a flex child *or* absolutely positioned it lays
            // the image out 0px wide, leaving nothing but the blurred backdrop.
            // `relative` puts it in the positioned layer, above that backdrop.
            className="relative h-full w-full object-contain"
            onError={() => setFailed(prev => new Set(prev).add(current))}
          />
        </>
      )}

      {photos.length > 1 && (
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
            {photos.map((p, i) => (
              <button
                key={p.large}
                data-cy="card-image-dot"
                data-active={String(i === index)}
                type="button"
                aria-label={`Image ${i + 1} of ${photos.length}`}
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
