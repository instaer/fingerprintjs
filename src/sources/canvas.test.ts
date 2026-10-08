import { isSamsungInternet, getBrowserMajorVersion } from '../../tests/utils'
import getCanvasFingerprint, { ImageStatus } from './canvas'

describe('Sources', () => {
  describe('canvas', () => {
    it('returns expected value', async () => {
      const { winding, text, geometry } = await getCanvasFingerprint()

      expect(winding).toBeTrue()

      if (shouldBeUnstable()) {
        expect(text).toBe(ImageStatus.Unstable)
        expect(geometry).toBe(ImageStatus.Unstable)
      } else {
        expect(isDataURL(geometry)).toBeTrue()
        expect(isDataURL(text)).toBeTrue()

        expect(geometry.length).toBeGreaterThan(1000)
        expect(text.length).toBeGreaterThan(1000)
      }
    })

    it('returns stable values', async () => {
      const first = await getCanvasFingerprint()
      const second = await getCanvasFingerprint()
      expect(second).toEqual(first)
    })
  })
})

/**
 * Some browsers add per-render noise to the canvas image; the noise is detected at runtime by rendering
 * the images twice and comparing the results, so such browsers get the images marked as unstable.
 * A known case is Samsung Internet < 28: https://github.com/fingerprintjs/fingerprintjs/issues/791
 * Browsers without the noise (including the regular mode of Safari 17+ and Firefox 120+) keep the full
 * canvas entropy in the fingerprint.
 */
function shouldBeUnstable() {
  return isSamsungInternet() && (getBrowserMajorVersion() ?? 0) < 28
}

function isDataURL(url: string) {
  return /^data:image\/png;base64,([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/.test(url)
}
