import { getBrowserMajorVersion, isSamsungInternet, withMockProperties } from '../../tests/utils'

import { getAntiFingerprintingBrowser, getCrossSessionRandomizedSources, isBrave } from './antifingerprinting'

describe('Antifingerprinting environment detection', () => {
  it('detects Brave via navigator.brave', async () => {
    expect(isBrave()).toBeFalse() // The test browsers aren't Brave

    await withMockProperties(
      navigator,
      {
        brave: {
          get() {
            return { isBrave: () => Promise.resolve(true) }
          },
        },
      },
      async () => {
        expect(isBrave()).toBeTrue()
        expect(getAntiFingerprintingBrowser()).toBe('brave')
        expect(getCrossSessionRandomizedSources()).toEqual(
          jasmine.arrayContaining([
            'canvas',
            'audio',
            'webGlBasics',
            'webGlExtensions',
            'fonts',
            'hardwareConcurrency',
            'deviceMemory',
            'plugins',
          ]),
        )
      },
    )

    expect(isBrave()).toBeFalse()
    expect(getAntiFingerprintingBrowser()).not.toBe('brave')
  })

  it('returns no exclusions on regular browsers', () => {
    const isSamsungInternet26 = isSamsungInternet() && (getBrowserMajorVersion() ?? 0) >= 26
    const exclusions = getCrossSessionRandomizedSources()

    if (isSamsungInternet26) {
      expect(exclusions).toContain('audio')
      expect(getAntiFingerprintingBrowser()).toBe('samsung-internet')
    } else {
      expect(exclusions).toEqual([])
      expect(getAntiFingerprintingBrowser()).toBeUndefined()
    }
  })
})
