import { getBrowserMajorVersion, isSamsungInternet, withMockProperties } from '../../tests/utils'

import { isBrave, getCrossSessionRandomizedSources } from './antifingerprinting'

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
  })

  it('returns no exclusions on regular browsers', () => {
    const exclusions = getCrossSessionRandomizedSources()
    if (isSamsungInternet() && (getBrowserMajorVersion() ?? 0) >= 26) {
      expect(exclusions).toContain('audio')
    } else {
      expect(exclusions).toEqual([])
    }
  })
})
