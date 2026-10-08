import getIntegrity from './integrity'
import { BuiltinComponents } from './sources'
import { UnknownComponents } from './utils/entropy_source'
import { isMacOS, isWindows } from '../tests/utils'

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
})

/**
 * Makes components consistent with the real user agent
 */
function makeComponents(overrides: Record<string, unknown>): BuiltinComponents {
  const components: UnknownComponents = {
    platform: { value: isWindows() ? 'Win32' : isMacOS() ? 'MacIntel' : 'Linux x86_64', duration: 0 },
    hardwareConcurrency: { value: 8, duration: 0 },
    deviceMemory: { value: 8, duration: 0 },
    languages: { value: ['en-US'], duration: 0 },
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
