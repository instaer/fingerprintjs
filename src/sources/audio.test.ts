import { getBrowserMajorVersion, isMobile, isSafari, isSamsungInternet } from '../../tests/utils'
import getAudioFingerprint, { SpecialFingerprint } from './audio'

describe('Sources', () => {
  describe('audio', () => {
    it('returns expected value type depending on the browser', async () => {
      const result = getAudioFingerprint()

      if (doesBrowserSuspendAudioContext()) {
        expect(result).toBe(SpecialFingerprint.KnownForSuspending)
      } else {
        // A type guard
        if (typeof result !== 'function') {
          throw new Error('Expected to be a function')
        }
        const fingerprint = await result()

        if (isSamsungInternet() && (getBrowserMajorVersion() ?? 0) >= 26) {
          // Samsung Internet 26+ applies audio anti-fingerprinting measures. If the noise is per-render,
          // it's detected at runtime and the special value is returned; if the noise is session-consistent,
          // the fingerprint is stable within the session (and excluded from the visitor identifier by the agent).
          expect(fingerprint === SpecialFingerprint.KnownForAntifingerprinting || fingerprint >= 0).toBeTrue()
        } else {
          expect(fingerprint).toBeGreaterThanOrEqual(0)
        }
      }
    })

    it('returns a stable value', async () => {
      const first = getAudioFingerprint()
      const second = getAudioFingerprint()

      if (first === second) {
        return
      }

      if (typeof first !== 'function' || typeof second !== 'function') {
        throw new Error('Expected to be a function')
      }

      expect(await second()).toBe(await first())
    })
  })
})

function doesBrowserSuspendAudioContext() {
  // WebKit has stopped telling its real version in the user-agent string since version 605.1.15,
  // therefore the browser version has to be checked instead of the engine version.
  return isSafari() && isMobile() && (getBrowserMajorVersion() ?? 0) < 12
}
