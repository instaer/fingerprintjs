import { isChromium, isChromium122OrNewer, isSamsungInternet } from './browser'

/**
 * Detects the Brave browser.
 *
 * Brave farbles (adds session- and site-keyed noise to) canvas, audio and WebGL images by default, which makes the
 * corresponding entropy components stable within a session but different across sessions. Such components would flip
 * the visitor identifier on every new session, so they are excluded from the visitor identifier hash in Brave.
 *
 * The check is synchronous and cheap: the `navigator.brave` property is unique to Brave.
 * @see https://github.com/brave/brave-browser/wiki/Fingerprinting-Protection-Mode
 */
export function isBrave(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as { brave?: { isBrave?: unknown } }).brave === 'object' &&
    typeof (navigator as { brave?: { isBrave?: unknown } }).brave?.isBrave === 'function'
  )
}

/**
 * The browsers with built-in anti-fingerprinting that the agent knows how to handle.
 */
export type AntiFingerprintingBrowser = 'brave' | 'samsung-internet'

/**
 * Detects the anti-fingerprinting browser in the current environment, if any.
 *
 * In such browsers some entropy sources are randomized across sessions (see
 * `getCrossSessionRandomizedSources`), so the raw `visitorId` of such browsers is less
 * reliable and the server side may want to treat these visitors with an adjusted risk
 * policy. The check is synchronous and cheap.
 */
export function getAntiFingerprintingBrowser(): AntiFingerprintingBrowser | undefined {
  if (isBrave()) {
    return 'brave'
  }
  if (isChromium() && isSamsungInternet() && isChromium122OrNewer()) {
    return 'samsung-internet'
  }
  return undefined
}

/**
 * Detects the browsers that apply cross-session randomization to some entropy sources, making the sources
 * unreliable for a stable visitor identifier.
 *
 * Unlike per-read noise (detected at runtime by the sources themselves, e.g. canvas double-render comparison),
 * cross-session noise cannot be detected within a single session — the only reliable way to keep the visitor
 * identifier stable is to stop hashing the affected components in such browsers.
 */
export function getCrossSessionRandomizedSources(): readonly string[] {
  const excluded = new Set<string>()
  const browser = getAntiFingerprintingBrowser()

  if (browser === 'brave') {
    // Brave farbles canvas and audio with session+site keyed noise
    excluded.add('canvas')
    excluded.add('audio')
    // Since v1.93 Brave generalizes the WebGL vendor/renderer (stable, but no entropy) and randomizes the
    // WebGL extension list (unstable across sessions)
    excluded.add('webGlBasics')
    excluded.add('webGlExtensions')
    // Brave randomizes the detection result of a subset of user-installed fonts
    excluded.add('fonts')
    // Brave also randomizes these navigator properties per session and site, so their values differ
    // between a regular window and a private window, flipping both identifier hashes.
    // See https://github.com/fingerprintjs/fingerprintjs/issues/1193
    excluded.add('hardwareConcurrency')
    excluded.add('deviceMemory')
    excluded.add('plugins')
  }

  // Samsung Internet 26+ applies audio anti-fingerprinting measures
  if (browser === 'samsung-internet') {
    excluded.add('audio')
  }

  return [...excluded]
}
