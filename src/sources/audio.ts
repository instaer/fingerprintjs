import * as browser from '../utils/browser'
import { isPromise, suppressUnhandledRejectionWarning } from '../utils/async'

export const enum SpecialFingerprint {
  /** The browser is known for always suspending audio context, thus making fingerprinting impossible */
  KnownForSuspending = -1,
  /** The browser doesn't support audio context */
  NotSupported = -2,
  /** An unexpected timeout has happened */
  Timeout = -3,
  /** The browser is known for applying anti-fingerprinting measures in all or some critical modes */
  KnownForAntifingerprinting = -4,
}

const enum InnerErrorName {
  Timeout = 'timeout',
  Suspended = 'suspended',
}

/**
 * A deep description: https://fingerprint.com/blog/audio-fingerprinting/
 * Inspired by and based on https://github.com/cozylife/audio-fingerprint
 *
 * Gets the audio fingerprint. The anti-fingerprinting modes that add per-render noise to the audio signal
 * (e.g. the private mode of Safari 17+) are detected at runtime by rendering the fingerprint twice on
 * independent audio contexts and comparing the results; such browsers get the special
 * `KnownForAntifingerprinting` value. Deterministic browsers keep the full audio entropy in the fingerprint.
 *
 * Session-consistent noise (e.g. Brave farbling) can't be detected this way; it's handled by the
 * `getCrossSessionRandomizedSources` exclusion in the agent.
 */
export default function getAudioFingerprint(): number | (() => Promise<number>) {
  return getUnstableAudioFingerprint()
}

/**
 * A version of the entropy source without stabilization.
 *
 * Warning for package users:
 * This function is out of Semantic Versioning, i.e. can change unexpectedly. Usage is at your own risk.
 */
export function getUnstableAudioFingerprint(): number | (() => Promise<number>) {
  const w = window
  const AudioContextConstructor = w.OfflineAudioContext || w.webkitOfflineAudioContext
  if (!AudioContextConstructor) {
    return SpecialFingerprint.NotSupported
  }

  // In some browsers, audio context always stays suspended unless the context is started in response to a user action
  // (e.g. a click or a tap). It prevents audio fingerprint from being taken at an arbitrary moment of time.
  // Such browsers are old and unpopular, so the audio fingerprinting is just skipped in them.
  // See a similar case explanation at https://stackoverflow.com/questions/46363048/onaudioprocess-not-called-on-ios11#46534088
  if (doesBrowserSuspendAudioContext()) {
    return SpecialFingerprint.KnownForSuspending
  }

  // The fingerprint is rendered twice on independent audio contexts to detect per-render noise, which some browsers
  // add in their anti-fingerprinting modes. See the comment on `getAudioFingerprint`.
  const first = startFingerprint(AudioContextConstructor)
  const second = startFingerprint(AudioContextConstructor)

  return () => {
    first.finishRendering()
    second.finishRendering()
    return Promise.all([first.fingerprintPromise, second.fingerprintPromise]).then(
      ([firstFingerprint, secondFingerprint]) => {
        if (typeof firstFingerprint !== 'number') {
          return firstFingerprint
        }
        if (typeof secondFingerprint !== 'number') {
          return secondFingerprint
        }
        const maxAbsolute = Math.max(Math.abs(firstFingerprint), Math.abs(secondFingerprint), 1)
        if (Math.abs(firstFingerprint - secondFingerprint) > NOISE_RELATIVE_TOLERANCE * maxAbsolute) {
          return SpecialFingerprint.KnownForAntifingerprinting
        }
        return firstFingerprint
      },
    )
  }
}

/**
 * The maximum relative difference between the two rendered fingerprints that is still considered as no noise.
 * Deterministic engines produce exactly equal values; anti-fingerprinting noise makes them much more different.
 */
const NOISE_RELATIVE_TOLERANCE = 1e-6

/**
 * Starts rendering an audio fingerprint.
 * When the returned `finishRendering` function is called, the render process starts finishing.
 */
function startFingerprint(AudioContextConstructor: typeof OfflineAudioContext) {
  const hashFromIndex = 4500
  const hashToIndex = 5000
  const context = new AudioContextConstructor(1, hashToIndex, 44100)

  const oscillator = context.createOscillator()
  oscillator.type = 'triangle'
  oscillator.frequency.value = 10000

  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -50
  compressor.knee.value = 40
  compressor.ratio.value = 12
  compressor.attack.value = 0
  compressor.release.value = 0.25

  oscillator.connect(compressor)
  compressor.connect(context.destination)
  oscillator.start(0)

  const [renderPromise, finishRendering] = startRenderingAudio(context)
  // Suppresses the console error message in case when the fingerprint fails before requested
  const fingerprintPromise = suppressUnhandledRejectionWarning(
    renderPromise.then(
      (buffer) => getHash(buffer.getChannelData(0).subarray(hashFromIndex)),
      (error) => {
        if (error.name === InnerErrorName.Timeout || error.name === InnerErrorName.Suspended) {
          return SpecialFingerprint.Timeout
        }
        throw error
      },
    ),
  )
  return { fingerprintPromise, finishRendering }
}

/**
 * Checks if the current browser is known for always suspending audio context
 */
function doesBrowserSuspendAudioContext() {
  // Mobile Safari 11 and older
  return browser.isWebKit() && !browser.isDesktopWebKit() && !browser.isWebKit606OrNewer()
}

/**
 * Starts rendering the audio context.
 * When the returned function is called, the render process starts finishing.
 */
function startRenderingAudio(context: OfflineAudioContext) {
  const renderTryMaxCount = 3
  const renderRetryDelay = 500
  const runningMaxAwaitTime = 500
  const runningSufficientTime = 5000
  let finalize = () => undefined as void

  const resultPromise = new Promise<AudioBuffer>((resolve, reject) => {
    let isFinalized = false
    let renderTryCount = 0
    let startedRunningAt = 0

    context.oncomplete = (event) => resolve(event.renderedBuffer)

    const startRunningTimeout = () => {
      setTimeout(
        () => reject(makeInnerError(InnerErrorName.Timeout)),
        Math.min(runningMaxAwaitTime, startedRunningAt + runningSufficientTime - Date.now()),
      )
    }

    const tryRender = () => {
      try {
        const renderingPromise = context.startRendering()

        // `context.startRendering` has two APIs: Promise and callback, we check that it's really a promise just in case
        if (isPromise(renderingPromise)) {
          // Suppresses all unhandled rejections in case of scheduled redundant retries after successful rendering
          suppressUnhandledRejectionWarning(renderingPromise)
        }

        switch (context.state) {
          case 'running':
            startedRunningAt = Date.now()
            if (isFinalized) {
              startRunningTimeout()
            }
            break

          // Sometimes the audio context doesn't start after calling `startRendering` (in addition to the cases where
          // audio context doesn't start at all). A known case is starting an audio context when the browser tab is in
          // background on iPhone. Retries usually help in this case.
          case 'suspended':
            // The audio context can reject starting until the tab is in foreground. Long fingerprint duration
            // in background isn't a problem, therefore the retry attempts don't count in background. It can lead to
            // a situation when a fingerprint takes very long time and finishes successfully. FYI, the audio context
            // can be suspended when `document.hidden === false` and start running after a retry.
            if (!document.hidden) {
              renderTryCount++
            }
            if (isFinalized && renderTryCount >= renderTryMaxCount) {
              reject(makeInnerError(InnerErrorName.Suspended))
            } else {
              setTimeout(tryRender, renderRetryDelay)
            }
            break
        }
      } catch (error) {
        reject(error)
      }
    }

    tryRender()

    finalize = () => {
      if (!isFinalized) {
        isFinalized = true
        if (startedRunningAt > 0) {
          startRunningTimeout()
        }
      }
    }
  })

  return [resultPromise, finalize] as const
}

function getHash(signal: ArrayLike<number>): number {
  let hash = 0
  for (let i = 0; i < signal.length; ++i) {
    hash += Math.abs(signal[i])
  }
  return hash
}

function makeInnerError(name: InnerErrorName) {
  const error = new Error(name)
  error.name = name
  return error
}
