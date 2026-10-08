/* eslint-disable @typescript-eslint/no-explicit-any */
import { getBrowserMajorVersion, isAndroid, isMacOS, isMobile, isSafari, isTablet, isWindows } from '../tests/utils'
import getConfidence from './confidence'
import { BuiltinComponents } from './sources'
import { UnknownComponents } from './utils/entropy_source'

describe('Confidence', () => {
  it('equals the platform prior when all the entropy is collected and no lies are detected', () => {
    const confidence = getConfidence(makeComponents({}), [], { score: 1, lies: [] })
    expect(confidence.score).toBe(getExpectedPrior())
  })

  it('lowers the score when the high-entropy components are missing', () => {
    const components = makeComponents({}) as any
    for (const key of [
      'canvas',
      'audio',
      'fonts',
      'webGlBasics',
      'webGlExtensions',
      'fontPreferences',
      'screenResolution',
      'hardwareConcurrency',
      'deviceMemory',
      'math',
      'audioBaseLatency',
      'timezone',
      'languages',
      'touchSupport',
      'dateTimeLocale',
    ]) {
      delete components[key]
    }
    const confidence = getConfidence(components as BuiltinComponents, [], { score: 1, lies: [] })
    expect(confidence.score).toBeLessThan(getExpectedPrior())
  })

  it('lowers the score when the components are excluded for the current environment', () => {
    const excluded = ['canvas', 'audio', 'fonts', 'webGlBasics', 'webGlExtensions']
    const confidence = getConfidence(makeComponents({}), excluded, { score: 1, lies: [] })
    expect(confidence.score).toBeLessThan(getExpectedPrior())
    expect(confidence.comment).toContain('excluded: canvas')
  })

  it('lowers the score when lies are detected', () => {
    const confidence = getConfidence(makeComponents({}), [], { score: 0.5, lies: ['osMismatch: ...'] })
    const fullTrust = getConfidence(makeComponents({}), [], { score: 1, lies: [] })
    expect(confidence.score).toBeLessThan(fullTrust.score)
    expect(confidence.comment).toContain('lies: 1')
  })

  it('keeps the score in the allowed range', () => {
    const confidence = getConfidence({} as BuiltinComponents, [], { score: 0, lies: ['x'] })
    expect(confidence.score).toBeGreaterThanOrEqual(0.01)
    expect(confidence.score).toBeLessThanOrEqual(0.99)
  })
})

/**
 * The expected initial score for the current platform, mirroring the logic of `getScorePrior`
 */
function getExpectedPrior(): number {
  if (isAndroid()) {
    return 0.4
  }
  if (isSafari()) {
    if (isMobile() || isTablet() || (getBrowserMajorVersion() ?? 0) >= 17) {
      return 0.3
    }
    return 0.5
  }
  if (isWindows()) {
    return 0.6
  }
  if (isMacOS()) {
    return 0.5
  }
  return 0.7
}

/**
 * Makes components with all the entropy sources collected
 */
function makeComponents(overrides: Record<string, unknown>): BuiltinComponents {
  const components: UnknownComponents = {
    platform: { value: isWindows() ? 'Win32' : isMacOS() ? 'MacIntel' : 'Linux x86_64', duration: 0 },
    canvas: {
      value: { winding: true, geometry: 'data:image/png;base64,AAAA', text: 'data:image/png;base64,BBBB' },
      duration: 0,
    },
    audio: { value: 35.73832999999999, duration: 0 },
    fonts: { value: ['Arial', 'Calibri'], duration: 0 },
    webGlBasics: {
      value: { vendor: 'Khronos Group', renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics, X11)' },
      duration: 0,
    },
    webGlExtensions: { value: { extensions: 30, parameters: 42 }, duration: 0 },
    fontPreferences: { value: 'default', duration: 0 },
    screenResolution: { value: [1920, 1080], duration: 0 },
    hardwareConcurrency: { value: 8, duration: 0 },
    deviceMemory: { value: 8, duration: 0 },
    math: { value: { sin: 'x', cos: 'y' }, duration: 0 },
    audioBaseLatency: { value: 0.005, duration: 0 },
    timezone: { value: 'Europe/London', duration: 0 },
    languages: { value: ['en-US'], duration: 0 },
    touchSupport: { value: { maxTouchPoints: 0 }, duration: 0 },
    dateTimeLocale: { value: 'en-US', duration: 0 },
    ...overrides,
  }
  return components as BuiltinComponents
}
