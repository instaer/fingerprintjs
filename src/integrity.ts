import { BuiltinComponents } from './sources'
import { UnknownComponents } from './utils/entropy_source'

/**
 * Result of the cross-component consistency checks.
 * It tells whether the browser properties look coherent or some of them are probably spoofed,
 * which is a strong signal of a bot, an anti-fingerprinting tool or a manually modified browser.
 */
export interface Integrity {
  /**
   * A number between 0 and 1 that tells how consistent the components are with each other.
   * The higher the number, the less signs of tampering are detected.
   */
  score: number
  /**
   * The list of detected inconsistencies, as human-readable strings
   */
  lies: readonly string[]
}

const enum OsFamily {
  Windows = 'windows',
  MacOS = 'macos',
  IOS = 'ios',
  Android = 'android',
  Linux = 'linux',
}

/** The status of an integrity check: a lie message, a passed check or a skipped check (not enough data) */
type CheckResult = string | null | undefined

function getOsFamilyFromUserAgent(userAgent: string): OsFamily | undefined {
  if (!userAgent) {
    return undefined
  }
  if (/Windows/i.test(userAgent)) {
    return OsFamily.Windows
  }
  if (/(iPhone|iPad|iPod)/i.test(userAgent)) {
    return OsFamily.IOS
  }
  if (/Android/i.test(userAgent)) {
    return OsFamily.Android
  }
  if (/(Macintosh|Mac OS X)/i.test(userAgent)) {
    return OsFamily.MacOS
  }
  if (/(Linux|X11|CrOS)/i.test(userAgent)) {
    return OsFamily.Linux
  }
  return undefined
}

function getOsFamilyFromPlatform(platform: string): OsFamily | undefined {
  if (!platform) {
    return undefined
  }
  if (/^Win/.test(platform)) {
    return OsFamily.Windows
  }
  // Real iOS devices report 'iPhone', 'iPad' and 'iPod'.
  // iPads in desktop mode and Macs report 'MacIntel', such platforms are checked by the user agent instead.
  if (/^(iPhone|iPad|iPod)/.test(platform)) {
    return OsFamily.IOS
  }
  if (/^Mac/.test(platform)) {
    return OsFamily.MacOS
  }
  // Android and Linux desktop report 'Linux ...', which is ambiguous, so it's not checked
  return undefined
}

function getOsFamilyFromOscpu(osCpu: string): OsFamily | undefined {
  if (!osCpu) {
    return undefined
  }
  if (/Windows/i.test(osCpu)) {
    return OsFamily.Windows
  }
  if (/Android/i.test(osCpu)) {
    return OsFamily.Android
  }
  if (/Mac/i.test(osCpu)) {
    return OsFamily.MacOS
  }
  // 'Linux ...' is ambiguous: Linux desktop or Android, so it's not checked
  return undefined
}

function getOsFamilyFromUserAgentDataPlatform(platform: string): OsFamily | undefined {
  switch (platform) {
    case 'Windows':
      return OsFamily.Windows
    case 'macOS':
      return OsFamily.MacOS
    case 'iOS':
      return OsFamily.IOS
    case 'Android':
      return OsFamily.Android
    case 'Chrome OS':
    case 'Linux':
      return OsFamily.Linux
    default:
      return undefined
  }
}

/**
 * Gets a component value, or `undefined` when the component is missing or has an error
 */
function getComponentValue(components: UnknownComponents, key: string): unknown {
  const component = components[key]
  if (!component || !('value' in component)) {
    return undefined
  }
  return component.value
}

/**
 * Detects inconsistencies between the components. A mismatch is a strong sign that some browser properties
 * are spoofed (e.g. a changed user agent, an anti-fingerprinting tool or a bot).
 *
 * Every check is only applied when the required data is present; a missing component doesn't affect the score.
 */
export default function getIntegrity(components: BuiltinComponents): Integrity {
  const rawComponents = components as UnknownComponents
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const userAgentOsFamily = getOsFamilyFromUserAgent(userAgent)

  const checks: Array<{ weight: number; result: CheckResult }> = [
    {
      // navigator.platform vs the user agent
      weight: 0.25,
      result: checkPlatform(rawComponents, userAgentOsFamily),
    },
    {
      // osCpu (Firefox) vs the user agent
      weight: 0.1,
      result: checkOscpu(rawComponents, userAgentOsFamily),
    },
    {
      // user agent data (set by the browser itself) vs the user agent
      weight: 0.1,
      result: checkUserAgentData(rawComponents, userAgentOsFamily),
    },
    {
      weight: 0.1,
      result: checkHardwareConcurrency(rawComponents),
    },
    {
      weight: 0.1,
      result: checkDeviceMemory(rawComponents),
    },
    {
      weight: 0.1,
      result: checkLanguages(rawComponents),
    },
    {
      // The GPU reported by WebGL vs the operating system
      weight: 0.2,
      result: checkWebGlRenderer(rawComponents, userAgentOsFamily),
    },
    {
      weight: 0.1,
      result: checkScreenResolution(rawComponents),
    },
    {
      weight: 0.05,
      result: checkColorDepth(rawComponents),
    },
  ]

  let appliedWeight = 0
  let lieWeight = 0
  const lies: string[] = []
  for (const { weight, result } of checks) {
    if (result === undefined) {
      // Not enough data to run the check
      continue
    }
    appliedWeight += weight
    if (result !== null) {
      lieWeight += weight
      lies.push(result)
    }
  }

  // No data to check — nothing looks suspicious
  if (appliedWeight === 0) {
    return { score: 1, lies }
  }

  const score = 1 - lieWeight / appliedWeight
  return { score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)), lies }
}

function checkPlatform(components: UnknownComponents, userAgentOsFamily: OsFamily | undefined): CheckResult {
  const platform = getComponentValue(components, 'platform')
  if (typeof platform !== 'string' || !platform || userAgentOsFamily === undefined) {
    return undefined
  }
  const platformOsFamily = getOsFamilyFromPlatform(platform)
  if (platformOsFamily === undefined || platformOsFamily === userAgentOsFamily) {
    return null
  }
  // iPads in desktop mode are an exception: the platform is 'MacIntel', the user agent looks like a Mac one,
  // but touch support is enabled
  if (userAgentOsFamily === OsFamily.MacOS && platformOsFamily === OsFamily.IOS) {
    return null
  }
  return `osMismatch: the user agent says ${userAgentOsFamily}, but navigator.platform is "${platform}"`
}

function checkOscpu(components: UnknownComponents, userAgentOsFamily: OsFamily | undefined): CheckResult {
  const osCpu = getComponentValue(components, 'osCpu')
  if (typeof osCpu !== 'string' || !osCpu || userAgentOsFamily === undefined) {
    return undefined
  }
  const osCpuOsFamily = getOsFamilyFromOscpu(osCpu)
  if (osCpuOsFamily === undefined || osCpuOsFamily === userAgentOsFamily) {
    return null
  }
  return `osMismatch: the user agent says ${userAgentOsFamily}, but navigator.oscpu is "${osCpu}"`
}

function checkUserAgentData(components: UnknownComponents, userAgentOsFamily: OsFamily | undefined): CheckResult {
  const userAgentData = getComponentValue(components, 'userAgentData')
  if (userAgentData === undefined || userAgentData === null || userAgentOsFamily === undefined) {
    return undefined
  }
  const platform =
    typeof userAgentData === 'object' && userAgentData !== null && 'platform' in userAgentData
      ? (userAgentData as { platform?: unknown }).platform
      : undefined
  if (typeof platform !== 'string' || !platform) {
    return undefined
  }
  const platformOsFamily = getOsFamilyFromUserAgentDataPlatform(platform)
  if (platformOsFamily === undefined || platformOsFamily === userAgentOsFamily) {
    return null
  }
  return `osMismatch: the user agent says ${userAgentOsFamily}, but the user agent data platform is "${platform}"`
}

function checkHardwareConcurrency(components: UnknownComponents): CheckResult {
  const hardwareConcurrency = getComponentValue(components, 'hardwareConcurrency')
  if (typeof hardwareConcurrency !== 'number') {
    return undefined
  }
  if (!Number.isInteger(hardwareConcurrency) || hardwareConcurrency < 1 || hardwareConcurrency > 1024) {
    return `implausibleValue: navigator.hardwareConcurrency is ${hardwareConcurrency}`
  }
  return null
}

function checkDeviceMemory(components: UnknownComponents): CheckResult {
  const deviceMemory = getComponentValue(components, 'deviceMemory')
  if (typeof deviceMemory !== 'number') {
    return undefined
  }
  // Browsers round and cap the value, see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory
  const plausibleValues = [0.25, 0.5, 1, 2, 4, 8]
  if (!plausibleValues.includes(deviceMemory)) {
    return `implausibleValue: navigator.deviceMemory is ${deviceMemory}, expected one of ${plausibleValues.join(', ')}`
  }
  return null
}

function checkLanguages(components: UnknownComponents): CheckResult {
  const languages = getComponentValue(components, 'languages')
  if (!Array.isArray(languages)) {
    return undefined
  }
  if (languages.length === 0 || languages.some((language) => typeof language !== 'string' || !language)) {
    return `implausibleValue: navigator.languages is ${JSON.stringify(languages)}`
  }
  return null
}

function checkWebGlRenderer(components: UnknownComponents, userAgentOsFamily: OsFamily | undefined): CheckResult {
  const webGlBasics = getComponentValue(components, 'webGlBasics')
  if (typeof webGlBasics !== 'object' || webGlBasics === null || !('renderer' in webGlBasics)) {
    return undefined
  }
  const renderer = (webGlBasics as { renderer?: unknown }).renderer
  if (typeof renderer !== 'string' || !renderer || userAgentOsFamily === undefined) {
    return undefined
  }
  if (/Apple/i.test(renderer) && userAgentOsFamily !== OsFamily.MacOS && userAgentOsFamily !== OsFamily.IOS) {
    return `gpuMismatch: the user agent says ${userAgentOsFamily}, but the WebGL renderer is "${renderer}"`
  }
  if (/Direct3D|D3D/i.test(renderer) && userAgentOsFamily !== OsFamily.Windows) {
    return `gpuMismatch: the user agent says ${userAgentOsFamily}, but the WebGL renderer is "${renderer}"`
  }
  return null
}

function checkScreenResolution(components: UnknownComponents): CheckResult {
  const screenResolution = getComponentValue(components, 'screenResolution')
  if (!Array.isArray(screenResolution) || screenResolution.length !== 2) {
    return undefined
  }
  const [width, height] = screenResolution
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384
  ) {
    return `implausibleValue: the screen resolution is ${JSON.stringify(screenResolution)}`
  }
  return null
}

function checkColorDepth(components: UnknownComponents): CheckResult {
  const colorDepth = getComponentValue(components, 'colorDepth')
  if (typeof colorDepth !== 'number') {
    return undefined
  }
  if (!Number.isInteger(colorDepth) || colorDepth < 1 || colorDepth > 64) {
    return `implausibleValue: the screen color depth is ${colorDepth}`
  }
  return null
}
