import { version } from '../package.json'
import { requestIdleCallbackIfAvailable } from './utils/async'
import { UnknownComponents } from './utils/entropy_source'
import { x64hash128 } from './utils/hashing'
import { errorToObject } from './utils/misc'
import {
  getAntiFingerprintingBrowser,
  getCrossSessionRandomizedSources,
  AntiFingerprintingBrowser,
} from './utils/antifingerprinting'
import loadBuiltinSources, { BuiltinComponents } from './sources'
import getConfidence, { Confidence } from './confidence'
import getIntegrity, { Integrity } from './integrity'

/**
 * Options for Fingerprint class loading
 */
export interface LoadOptions {
  /**
   * When browser doesn't support `requestIdleCallback` a `setTimeout` will be used. This number is only for Safari and
   * old Edge, because Chrome/Blink based browsers support `requestIdleCallback`. The value is in milliseconds.
   * @default 50
   */
  delayFallback?: number
  /**
   * Whether to print debug messages to the console.
   * Required to ease investigations of problems.
   */
  debug?: boolean
}

/**
 * Options for getting visitor identifier
 */
export interface GetOptions {
  /**
   * Whether to print debug messages to the console.
   *
   * @deprecated Use the `debug` option of `load()` instead
   */
  debug?: boolean
}

/**
 * The components that rarely change. They are used to build `stableVisitorId`.
 *
 * Volatile components (canvas, audio, fonts, WebGL, storage availability, user media preferences, etc.) are excluded:
 * they can change due to browser updates, GPU driver updates, user settings or anti-fingerprinting noise.
 */
export const stableComponentKeys: readonly string[] = [
  'userAgentData',
  'languages',
  'timezone',
  'colorDepth',
  'screenResolution',
  'hardwareConcurrency',
  'deviceMemory',
  'osCpu',
  'cpuClass',
  'platform',
  'vendor',
  'vendorFlavors',
  'touchSupport',
  'colorGamut',
  'monochrome',
  // `hdr` is deliberately excluded: on iOS Safari the `dynamic-range` media query flips
  // with the system state (low power mode, auto-brightness), see upstream issue #809
  'math',
  'architecture',
  'applePay',
  'privateClickMeasurement',
  'audioBaseLatency',
  'dateTimeLocale',
  'pdfViewerEnabled',
]

/**
 * Result of getting a visitor identifier
 */
export interface GetResult {
  /**
   * The visitor identifier. Built from all collected components except the ones excluded
   * for the current environment (see `excludedComponents`).
   */
  visitorId: string
  /**
   * A visitor identifier built only from the components that rarely change (see `stableComponentKeys`).
   *
   * It stays the same when volatile components (canvas, audio, fonts, WebGL, etc.) change, e.g. when the browser
   * updates, the GPU driver updates or an anti-fingerprinting feature starts randomizing an entropy source.
   * When the main `visitorId` changes but `stableVisitorId` remains the same, the visitor most likely is the same.
   * Use it on the server side as a clustering key to match identifiers that changed.
   */
  stableVisitorId: string
  /**
   * A confidence score that tells how much the agent is sure about the visitor identifier
   */
  confidence: Confidence
  /**
   * Result of the cross-component consistency checks (tampering detection)
   */
  integrity: Integrity
  /**
   * The source keys that are excluded from the `visitorId` and `stableVisitorId` hashes, because the current
   * environment is known to randomize them across sessions (e.g. Brave farbling). The raw values of the excluded
   * sources are still collected and available in `components` for server-side analysis.
   */
  excludedComponents: readonly string[]
  /**
   * The anti-fingerprinting browser detected in the current environment (e.g. Brave), if any.
   *
   * When set, the browser randomizes some entropy sources across sessions, so they are excluded from the
   * identifier hashes (see `excludedComponents`) and `confidence` is lower. The server side may want to
   * treat such visitors with an adjusted risk policy.
   */
  antiFingerprintingBrowser: AntiFingerprintingBrowser | undefined
  /**
   * List of components that has formed the visitor identifier.
   *
   * Warning! The type of this property is specific but out of Semantic Versioning, i.e. may have incompatible changes
   * within a major version. If you want to avoid breaking changes, treat the property as having type
   * `UnknownComponents` that is more generic but guarantees backward compatibility within a major version.
   */
  components: BuiltinComponents
  /**
   * The fingerprinting algorithm version
   *
   * @see https://github.com/fingerprintjs/fingerprintjs#version-policy For more details
   */
  version: string
}

/**
 * Agent object that can get visitor identifier
 */
export interface Agent {
  /**
   * Gets the visitor identifier
   */
  get(options?: Readonly<GetOptions>): Promise<GetResult>
}

function componentsToCanonicalString(components: UnknownComponents) {
  let result = ''
  for (const componentKey of Object.keys(components).sort()) {
    const component = components[componentKey]
    const value = 'error' in component ? 'error' : JSON.stringify(component.value)
    result += `${result ? '|' : ''}${componentKey.replace(/([:|\\])/g, '\\$1')}:${value}`
  }
  return result
}

export function componentsToDebugString(components: UnknownComponents): string {
  return JSON.stringify(
    components,
    (_key, value) => {
      if (value instanceof Error) {
        return errorToObject(value)
      }
      return value
    },
    2,
  )
}

export function hashComponents(components: UnknownComponents): string {
  return x64hash128(componentsToCanonicalString(components))
}

function pickComponents(components: UnknownComponents, keys: readonly string[]): UnknownComponents {
  const result: UnknownComponents = {}
  for (const key of keys) {
    if (key in components) {
      result[key] = components[key]
    }
  }
  return result
}

function omitComponents(components: UnknownComponents, keys: readonly string[]): UnknownComponents {
  const result: UnknownComponents = {}
  const excluded = new Set(keys)
  for (const key of Object.keys(components)) {
    if (!excluded.has(key)) {
      result[key] = components[key]
    }
  }
  return result
}

/**
 * Makes a GetResult implementation that calculates the visitor id hashes on demand.
 * Designed for optimisation.
 */
function makeLazyGetResult(
  components: BuiltinComponents,
  excludedComponents: readonly string[],
  antiFingerprintingBrowser: AntiFingerprintingBrowser | undefined,
): GetResult {
  const hashedComponents = omitComponents(components, excludedComponents)
  const stableComponents = omitComponents(pickComponents(components, stableComponentKeys), excludedComponents)
  let visitorIdCache: string | undefined
  let stableVisitorIdCache: string | undefined

  // These functions run very fast, so there is no need to make them lazy
  const integrity = getIntegrity(components)
  const confidence = getConfidence(components, excludedComponents, integrity)

  // A plain class isn't used because its getters and setters aren't enumerable.
  return {
    get visitorId(): string {
      if (visitorIdCache === undefined) {
        visitorIdCache = hashComponents(hashedComponents)
      }
      return visitorIdCache
    },
    set visitorId(visitorId: string) {
      visitorIdCache = visitorId
    },
    get stableVisitorId(): string {
      if (stableVisitorIdCache === undefined) {
        stableVisitorIdCache = hashComponents(stableComponents)
      }
      return stableVisitorIdCache
    },
    set stableVisitorId(stableVisitorId: string) {
      stableVisitorIdCache = stableVisitorId
    },
    confidence,
    integrity,
    excludedComponents,
    antiFingerprintingBrowser,
    components,
    version,
  }
}

/**
 * A delay is required to ensure consistent entropy components.
 * See https://github.com/fingerprintjs/fingerprintjs/issues/254
 * and https://github.com/fingerprintjs/fingerprintjs/issues/307
 * and https://github.com/fingerprintjs/fingerprintjs/commit/945633e7c5f67ae38eb0fea37349712f0e669b18
 */
export function prepareForSources(delayFallback = 50): Promise<void> {
  // A proper deadline is unknown. Let it be twice the fallback timeout so that both cases have the same average time.
  return requestIdleCallbackIfAvailable(delayFallback, delayFallback * 2)
}

/**
 * The function isn't exported from the index file to not allow to call it without `load()`.
 * The hiding gives more freedom for future non-breaking updates.
 *
 * A factory function is used instead of a class to shorten the attribute names in the minified code.
 * Native private class fields could've been used, but TypeScript doesn't allow them with `"target": "es5"`.
 */
function makeAgent(
  getComponents: () => Promise<BuiltinComponents>,
  excludedComponents: readonly string[],
  antiFingerprintingBrowser: AntiFingerprintingBrowser | undefined,
  debug?: boolean,
): Agent {
  const creationTime = Date.now()

  return {
    async get(options) {
      const startTime = Date.now()
      const components = await getComponents()
      const result = makeLazyGetResult(components, excludedComponents, antiFingerprintingBrowser)

      if (debug || options?.debug) {
        // console.log is ok here because it's under a debug clause
        // eslint-disable-next-line no-console
        console.log(`Copy the text below to get the debug data:

\`\`\`
version: ${result.version}
userAgent: ${navigator.userAgent}
timeBetweenLoadAndGet: ${startTime - creationTime}
visitorId: ${result.visitorId}
stableVisitorId: ${result.stableVisitorId}
confidence: ${result.confidence.score}
integrity: ${result.integrity.score} (${result.integrity.lies.length} lies)
excludedComponents: ${result.excludedComponents.join(', ') || 'none'}
antiFingerprintingBrowser: ${result.antiFingerprintingBrowser || 'none'}
components: ${componentsToDebugString(components)}
\`\`\``)
      }

      return result
    },
  }
}

/**
 * Builds an instance of Agent and waits a delay required for a proper operation.
 */
export async function load(options: Readonly<LoadOptions> = {}): Promise<Agent> {
  const { delayFallback, debug } = options
  await prepareForSources(delayFallback)
  const getComponents = loadBuiltinSources({ cache: {}, debug })
  const excludedComponents = getCrossSessionRandomizedSources()
  return makeAgent(getComponents, excludedComponents, getAntiFingerprintingBrowser(), debug)
}
