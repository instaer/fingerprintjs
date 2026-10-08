import getIntegrity from './integrity'
import { BuiltinComponents } from './sources'
import { UnknownComponents } from './utils/entropy_source'
import { isAndroid, isMacOS, isWindows, withMockProperties } from '../tests/utils'

describe('Integrity', () => {
  it('gives the full score when nothing is inconsistent', () => {
    const integrity = getIntegrity(makeComponents({}))
    expect(integrity.score).toBe(1)
    expect(integrity.lies).toEqual([])
  })

  it('gives the full score when there is no data to check', () => {
    const integrity = getIntegrity({} as BuiltinComponents)
    expect(integrity.score).toBe(1)
    expect(integrity.lies).toEqual([])
  })

  it('detects a platform mismatching the user agent', () => {
    // The platform that mismatches the real user agent
    const wrongPlatform = isWindows() ? 'MacIntel' : 'Win32'
    const integrity = getIntegrity(makeComponents({ platform: { value: wrongPlatform, duration: 0 } }))
    expect(integrity.score).toBeLessThan(1)
    expect(integrity.lies.length).toBeGreaterThan(0)
    expect(integrity.lies[0]).toContain('osMismatch')
  })

  it('detects a GPU mismatching the user agent', () => {
    // The Apple GPU on a non-Apple platform
    const wrongRenderer = isMacOS() ? 'ANGLE (Intel, Direct3D11)' : 'Apple M1'
    const integrity = getIntegrity(
      makeComponents({
        webGlBasics: { value: { vendor: 'Apple', renderer: wrongRenderer }, duration: 0 },
      }),
    )
    expect(integrity.score).toBeLessThan(1)
    expect(integrity.lies.some((lie) => lie.includes('gpuMismatch'))).toBeTrue()
  })

  it('detects implausible values', () => {
    const integrity = getIntegrity(
      makeComponents({
        hardwareConcurrency: { value: 4.5, duration: 0 },
        deviceMemory: { value: 3, duration: 0 },
      }),
    )
    expect(integrity.score).toBeLessThan(1)
    expect(integrity.lies.some((lie) => lie.includes('implausibleValue'))).toBeTrue()
  })

  it('accepts the quantized memory sizes that real browsers report', () => {
    // The Device Memory API returns the RAM size rounded down to the nearest power of 2 and clamped.
    // Chromium 151+ reports 16 and 32 on desktops; Android keeps the cap at 8.
    const plausibleSizes = isAndroid() ? [0.25, 0.5, 1, 2, 4, 8] : [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128]
    for (const deviceMemory of plausibleSizes) {
      const integrity = getIntegrity(makeComponents({ deviceMemory: { value: deviceMemory, duration: 0 } }))
      expect(integrity.score).toBe(1)
      expect(integrity.lies).toEqual([])
    }
  })

  it('detects non-quantized memory sizes that spoofing tools set', () => {
    // A real 12 GB machine reports 8; 12, 24 and 48 are raw hardware sizes that a naive
    // spoofing tool sets instead of the quantized value
    for (const deviceMemory of [0.3, 1.5, 3, 6, 12, 24, 48, 96, 256]) {
      const integrity = getIntegrity(makeComponents({ deviceMemory: { value: deviceMemory, duration: 0 } }))
      expect(integrity.lies.some((lie) => lie.includes('navigator.deviceMemory'))).toBeTrue()
    }
  })

  it('detects a desktop memory size behind an Android user agent', async () => {
    // Android caps navigator.deviceMemory at 8, so a bigger value means that the user agent
    // is overridden (e.g. DevTools device emulation) or the memory size is spoofed
    await withMockProperties(
      navigator,
      {
        userAgent: {
          get: () =>
            'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0' +
            ' Mobile Safari/537.36',
        },
      },
      () => {
        const integrity = getIntegrity(
          makeComponents({
            deviceMemory: { value: 16, duration: 0 },
            platform: { value: 'Linux armv8l', duration: 0 },
            webGlBasics: { value: { vendor: 'Qualcomm', renderer: 'Adreno (TM) 660' }, duration: 0 },
          }),
        )
        expect(integrity.lies.length).toBe(1)
        expect(integrity.lies[0]).toContain('Android caps it at 8')
      },
    )
  })

  it('accepts the languages component shape of real browsers', () => {
    // Chromium 86+ reports a single tag group (navigator.languages is ignored for incognito
    // mode stability, see src/sources/languages.ts)
    const integrity = getIntegrity(makeComponents({ languages: { value: [['zh-CN']], duration: 0 } }))
    expect(integrity.score).toBe(1)
    expect(integrity.lies).toEqual([])

    // Firefox and Safari report the language and the languages list as separate tag groups
    const integrity2 = getIntegrity(makeComponents({ languages: { value: [['en-US'], ['en-US', 'en']], duration: 0 } }))
    expect(integrity2.score).toBe(1)
    expect(integrity2.lies).toEqual([])
  })

  it('detects a broken languages component', () => {
    // `['en-US']` is a flat array, which the languages source never produces;
    // the other values are broken shapes of a spoofed navigator
    const brokenShapes = [[], [[]], [['en-US'], []], [['en-US'], [42]], [['en-US'], 'en'], ['en-US']]
    for (const languages of brokenShapes) {
      const integrity = getIntegrity(makeComponents({ languages: { value: languages, duration: 0 } }))
      expect(integrity.lies.some((lie) => lie.includes('navigator.languages'))).toBeTrue()
    }
  })
})

/**
 * Makes components consistent with the real user agent
 */
function makeComponents(overrides: Record<string, unknown>): BuiltinComponents {
  const components: UnknownComponents = {
    platform: { value: isWindows() ? 'Win32' : isMacOS() ? 'MacIntel' : 'Linux x86_64', duration: 0 },
    hardwareConcurrency: { value: 8, duration: 0 },
    deviceMemory: { value: 8, duration: 0 },
    languages: { value: [['en-US']], duration: 0 },
    screenResolution: { value: [1920, 1080], duration: 0 },
    colorDepth: { value: 24, duration: 0 },
    webGlBasics: {
      value: {
        vendor: 'Khronos Group',
        renderer: isMacOS() ? 'Apple M1' : 'ANGLE (Intel, Mesa Intel(R) UHD Graphics, X11)',
      },
      duration: 0,
    },
    ...overrides,
  }
  return components as BuiltinComponents
}
