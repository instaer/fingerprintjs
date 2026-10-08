export interface CanvasFingerprint {
  winding: boolean
  geometry: string
  text: string
}

export const enum ImageStatus {
  Unsupported = 'unsupported',
  Skipped = 'skipped',
  Unstable = 'unstable',
}

/**
 * Gets the canvas fingerprint.
 *
 * The anti-fingerprinting modes that add per-render noise to canvas images (e.g. the private mode of Safari 17+,
 * the private mode and strict ETP of Firefox 120+) are detected at runtime by rendering the images twice on
 * independent canvases and comparing the results; such browsers keep the `winding` value and get the images marked
 * as unstable. Browsers without the noise are not skipped and keep the full canvas entropy in the fingerprint.
 *
 * Session-consistent noise (e.g. Brave farbling) can't be detected this way; it's handled by the
 * `getCrossSessionRandomizedSources` exclusion in the agent.
 *
 * @see https://www.browserleaks.com/canvas#how-does-it-work
 * @see https://bugzilla.mozilla.org/show_bug.cgi?id=1816189 Firefox canvas randomization
 */
export default function getCanvasFingerprint(): CanvasFingerprint {
  return getUnstableCanvasFingerprint()
}

/**
 * A version of the entropy source without stabilization.
 *
 * Warning for package users:
 * This function is out of Semantic Versioning, i.e. can change unexpectedly. Usage is at your own risk.
 */
export function getUnstableCanvasFingerprint(skipImages?: boolean): CanvasFingerprint {
  let winding = false
  let geometry: string
  let text: string

  const [canvas, context] = makeCanvasContext()
  if (!isSupported(canvas, context)) {
    geometry = text = ImageStatus.Unsupported
  } else {
    winding = doesSupportWinding(context)

    if (skipImages) {
      geometry = text = ImageStatus.Skipped
    } else {
      ;[geometry, text] = renderImages(canvas, context)
    }
  }

  return { winding, geometry, text }
}

function makeCanvasContext() {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return [canvas, canvas.getContext('2d')] as const
}

function isSupported(
  canvas: HTMLCanvasElement,
  context?: CanvasRenderingContext2D | null,
): context is CanvasRenderingContext2D {
  return !!(context && canvas.toDataURL)
}

function doesSupportWinding(context: CanvasRenderingContext2D) {
  // https://web.archive.org/web/20170825024655/http://blogs.adobe.com/webplatform/2013/01/30/winding-rules-in-canvas/
  // https://github.com/Modernizr/Modernizr/blob/master/feature-detects/canvas/winding.js
  context.rect(0, 0, 10, 10)
  context.rect(2, 2, 6, 6)
  return !context.isPointInPath(5, 5, 'evenodd')
}

function renderImages(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): [geometry: string, text: string] {
  const firstResult = renderImagesOnce(canvas, context)

  // The images are rendered again on another canvas to detect per-render noise, which some browsers add
  // in their anti-fingerprinting modes. See the comment on `getCanvasFingerprint`.
  const [anotherCanvas, anotherContext] = makeCanvasContext()
  if (!isSupported(anotherCanvas, anotherContext)) {
    return firstResult
  }
  const secondResult = renderImagesOnce(anotherCanvas, anotherContext)
  if (firstResult[0] !== secondResult[0] || firstResult[1] !== secondResult[1]) {
    return [ImageStatus.Unstable, ImageStatus.Unstable]
  }
  return firstResult
}

function renderImagesOnce(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): [geometry: string, text: string] {
  renderTextImage(canvas, context)
  const textImage1 = canvasToString(canvas)
  const textImage2 = canvasToString(canvas) // It's slightly faster to double-encode the text image

  // Some browsers add a noise to the canvas: https://github.com/fingerprintjs/fingerprintjs/issues/791
  // The canvas is excluded from the fingerprint in this case
  if (textImage1 !== textImage2) {
    return [ImageStatus.Unstable, ImageStatus.Unstable]
  }

  // Text is unstable:
  // https://github.com/fingerprintjs/fingerprintjs/issues/583
  // https://github.com/fingerprintjs/fingerprintjs/issues/103
  // Therefore it's extracted into a separate image.
  renderGeometryImage(canvas, context)
  const geometryImage = canvasToString(canvas)
  return [geometryImage, textImage1]
}

function renderTextImage(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  // Resizing the canvas cleans it
  canvas.width = 240
  canvas.height = 60

  context.textBaseline = 'alphabetic'
  context.fillStyle = '#f60'
  context.fillRect(100, 1, 62, 20)

  context.fillStyle = '#069'
  // It's important to use explicit built-in fonts in order to exclude the affect of font preferences
  // (there is a separate entropy source for them).
  context.font = '11pt "Times New Roman"'
  // The choice of emojis has a gigantic impact on rendering performance (especially in FF).
  // Some newer emojis cause it to slow down 50-200 times.
  // There must be no text to the right of the emoji, see https://github.com/fingerprintjs/fingerprintjs/issues/574
  // A bare emoji shouldn't be used because the canvas will change depending on the script encoding:
  // https://github.com/fingerprintjs/fingerprintjs/issues/66
  // Escape sequence shouldn't be used too because Terser will turn it into a bare unicode.
  const printedText = `Cwm fjordbank gly ${String.fromCharCode(55357, 56835) /* 😃 */}`
  context.fillText(printedText, 2, 15)
  context.fillStyle = 'rgba(102, 204, 0, 0.2)'
  context.font = '18pt Arial'
  context.fillText(printedText, 4, 45)
}

function renderGeometryImage(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  // Resizing the canvas cleans it
  canvas.width = 122
  canvas.height = 110

  // Canvas blending
  // https://web.archive.org/web/20170826194121/http://blogs.adobe.com/webplatform/2013/01/28/blending-features-in-canvas/
  // http://jsfiddle.net/NDYV8/16/
  context.globalCompositeOperation = 'multiply'
  for (const [color, x, y] of [
    ['#f2f', 40, 40],
    ['#2ff', 80, 40],
    ['#ff2', 60, 80],
  ] as const) {
    context.fillStyle = color
    context.beginPath()
    context.arc(x, y, 40, 0, Math.PI * 2, true)
    context.closePath()
    context.fill()
  }

  // Canvas winding
  // https://web.archive.org/web/20130913061632/http://blogs.adobe.com/webplatform/2013/01/30/winding-rules-in-canvas/
  // http://jsfiddle.net/NDYV8/19/
  context.fillStyle = '#f9c'
  context.arc(60, 60, 60, 0, Math.PI * 2, true)
  context.arc(60, 60, 20, 0, Math.PI * 2, true)
  context.fill('evenodd')
}

function canvasToString(canvas: HTMLCanvasElement) {
  return canvas.toDataURL()
}
