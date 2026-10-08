import { BuiltinComponents } from './sources'
import { UnknownComponents } from './utils/entropy_source'
import { round } from './utils/data'
import { isAndroid, isWebKit, isDesktopWebKit, isWebKit616OrNewer, isSafariWebKit } from './utils/browser'
import { Integrity } from './integrity'

export interface Confidence {
  /**
   * A number between 0 and 1 that tells how much the agent is sure about the visitor identifier.
   * The higher the number, the higher the chance of the visitor identifier to be true.
   */
  score: number
  /**
   * Additional details about the score as a human-readable text
   */
  comment?: string
}

/**
 * The weights of the entropy components. They are roughly proportional to the amount of identifying information
 * the components give. The higher the weight, the more the absence of the component lowers the score.
 */
const entropyWeights: Readonly<Record<string, number>> = {
  canvas: 2.2, // The geometry and text images together
  audio: 1.2,
  fonts: 1.2,
  webGlBasics: 1,
  webGlExtensions: 0.8,
  fontPreferences: 0.8,
  screenResolution: 0.8,
  hardwareConcurrency: 0.5,
  deviceMemory: 0.5,
  math: 0.8,
  audioBaseLatency: 0.6,
  timezone: 0.4,
  languages: 0.4,
  touchSupport: 0.6,
  dateTimeLocale: 0.5,
}

/**
 * The canvas image statuses that mean that no fingerprint has been collected
 */
const nonCollectedCanvasStatuses = ['unsupported', 'skipped', 'unstable']

function getComponent(components: UnknownComponents, key: string) {
  return key in components ? components[key] : undefined
}

/**
 * Tells whether an entropy component has successfully provided a usable value.
 * Components that are excluded for the current environment are never usable.
 */
function isComponentCollected(components: UnknownComponents, key: string, excludedComponents: ReadonlySet<string>) {
  if (excludedComponents.has(key)) {
    return false
  }
  const component = getComponent(components, key)
  if (!component || !('value' in component)) {
    return false
  }
  const value = component.value

  switch (key) {
    case 'canvas':
      // The value is an object like { winding, geometry, text }
      return (
        typeof value === 'object' &&
        value !== null &&
        ['geometry', 'text'].some(
          (imageKey) =>
            typeof (value as Record<string, unknown>)[imageKey] === 'string' &&
            !nonCollectedCanvasStatuses.includes((value as Record<string, unknown>)[imageKey] as string),
        )
      )
    case 'audio':
      // The special values are negative, a real fingerprint is a non-negative number
      return typeof value === 'number' && value >= 0
    case 'fonts':
      return Array.isArray(value)
    case 'webGlBasics':
      return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { renderer?: unknown }).renderer === 'string' &&
        (value as { renderer?: unknown }).renderer !== ''
      )
    case 'webGlExtensions':
      return typeof value === 'object' && value !== null && Object.keys(value).length > 0
    default:
      return value !== undefined && value !== null
  }
}

/**
 * The share of the identifying information that has actually been collected, from 0 to 1.
 * Missing, failed, unstable and environment-excluded components lower the coverage.
 */
function getEntropyCoverage(components: UnknownComponents, excludedComponents: ReadonlySet<string>): number {
  let totalWeight = 0
  let collectedWeight = 0
  for (const [key, weight] of Object.entries(entropyWeights)) {
    totalWeight += weight
    if (isComponentCollected(components, key, excludedComponents)) {
      collectedWeight += weight
    }
  }
  return totalWeight === 0 ? 1 : collectedWeight / totalWeight
}

/**
 * The initial score, depending on the browser and platform. It's an approximation of the identification accuracy
 * on the platform, based on the amount of entropy the platform provides and the variety of devices on it.
 */
function getScorePrior(components: UnknownComponents): number {
  // In order to calculate the true probability of the visitor identifier being correct, we need to know the number of
  // website visitors (the higher the number, the less the probability because the fingerprint entropy is limited).
  // The agent doesn't know the number of visitors, so we can only do an approximate assessment.
  if (isAndroid()) {
    return 0.4
  }

  // Safari (mobile and desktop)
  if (isWebKit()) {
    return isDesktopWebKit() && !(isWebKit616OrNewer() && isSafariWebKit()) ? 0.5 : 0.3
  }

  const platformComponent = getComponent(components, 'platform')
  const platform = platformComponent && 'value' in platformComponent ? String(platformComponent.value) : ''

  // Windows
  if (/^Win/.test(platform)) {
    // The score is greater than on macOS because of the higher variety of devices running Windows.
    return 0.6
  }

  // macOS
  if (/^Mac/.test(platform)) {
    return 0.5
  }

  // Another platform, e.g. a desktop Linux. It's rare, so it should be pretty unique.
  return 0.7
}

/**
 * Calculates the confidence score of the visitor identifier.
 *
 * The score is dynamic: it starts from a platform prior, then lowers when high-entropy components are missing
 * (not supported, failed, detected unstable or excluded for the current environment), and lowers further when
 * the components look inconsistent (tampering detected, see `getIntegrity`).
 */
export default function getConfidence(
  components: BuiltinComponents,
  excludedComponents: readonly string[] = [],
  integrity?: Integrity,
): Confidence {
  const rawComponents = components as UnknownComponents
  const excluded = new Set(excludedComponents)

  const prior = getScorePrior(rawComponents)
  const coverage = getEntropyCoverage(rawComponents, excluded)
  const integrityScore = integrity ? integrity.score : 1

  // With a full coverage and no lies detected the score equals the prior;
  // with no entropy collected at all the score is 40% of the prior;
  // detected tampering lowers the score by up to a half of its value.
  const score = round(prior * (0.4 + 0.6 * coverage) * (0.5 + 0.5 * integrityScore), 0.01)
  const clampedScore = Math.max(0.01, Math.min(0.99, score))

  const commentParts = [
    `prior ${prior}`,
    `entropy coverage ${Math.round(coverage * 100)}%`,
    `integrity ${integrityScore}`,
  ]
  if (excludedComponents.length > 0) {
    commentParts.push(`excluded: ${excludedComponents.join(', ')}`)
  }
  if (integrity && integrity.lies.length > 0) {
    commentParts.push(`lies: ${integrity.lies.length}`)
  }

  return { score: clampedScore, comment: `The score is based on: ${commentParts.join('; ')}.` }
}
