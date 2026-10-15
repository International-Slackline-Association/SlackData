// Photos are resized and re-encoded in the browser before they are uploaded
// (D44): two sizes, 480 px and 1600 px on the long edge (P4-D), as WebP. Drawing
// to a canvas and exporting keeps nothing but the pixels, so camera metadata —
// GPS among it — never leaves the editor's device.
//
// Safari cannot encode WebP from a canvas (it hands back a PNG); there the
// photo is sent as JPEG instead, on white, since JPEG has no transparency. The
// server accepts JPEG, PNG and WebP, checked by their bytes.
//
// `fitWithin` and the limits are pure, for tests/unit/photoResize.test.ts; the
// rest needs a DOM.

export const MB = 1024 * 1024
/** D45: what an editor may pick, before processing. */
export const MAX_PHOTO_PICK = 10 * MB
export const MAX_MANUAL = 25 * MB
export const PICKABLE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const SMALL_PX = 480
export const LARGE_PX = 1600

/** The size to draw at: the long edge at most `px`, never enlarged. */
export function fitWithin(width: number, height: number, px: number): { width: number; height: number } {
  const scale = Math.min(1, px / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Why a picked file cannot be a photo, or null. */
export function photoProblem(file: { type: string; size: number; name: string }): string | null {
  if (!(PICKABLE_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name}: a photo must be JPEG, PNG or WebP`
  }
  if (file.size > MAX_PHOTO_PICK) return `${file.name}: over the 10 MB limit for a photo`
  return null
}

/** Why a picked file cannot be a manual, or null. */
export function manualProblem(file: { type: string; size: number; name: string }): string | null {
  if (file.type !== 'application/pdf') return `${file.name}: a manual must be a PDF`
  if (file.size > MAX_MANUAL) return `${file.name}: over the 25 MB limit for a manual`
  return null
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

async function draw(bitmap: ImageBitmap, px: number): Promise<Blob> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, px)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot resize photos.')
  context.drawImage(bitmap, 0, 0, width, height)
  const webp = await toBlob(canvas, 'image/webp', 0.8)
  if (webp && webp.type === 'image/webp') return webp
  // No WebP encoder (Safari): JPEG, flattened onto white.
  context.globalCompositeOperation = 'destination-over'
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.85)
  if (!jpeg) throw new Error('This browser could not encode the photo.')
  return jpeg
}

/** One picked photo -> its two sizes. Rotation from the camera is applied. */
export async function resizePhoto(file: File): Promise<{ small: Blob; large: Blob }> {
  const problem = photoProblem(file)
  if (problem) throw new Error(problem)
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    return { small: await draw(bitmap, SMALL_PX), large: await draw(bitmap, LARGE_PX) }
  } finally {
    bitmap.close()
  }
}

/** A brand's logo: one size, 480 px. */
export async function resizeLogo(file: File): Promise<Blob> {
  const problem = photoProblem(file)
  if (problem) throw new Error(problem.replace('a photo', 'a logo'))
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    return await draw(bitmap, SMALL_PX)
  } finally {
    bitmap.close()
  }
}
