/* eslint-disable @typescript-eslint/no-explicit-any */
import { version } from '../package.json'
import { load as loadAgent, hashComponents, stableComponentKeys } from './agent'
import { sources } from './sources'
import { isSourceLoaded } from './sources/cpu_class'
import { isBrave, getCrossSessionRandomizedSources } from './utils/antifingerprinting'
import { UnknownComponents } from './utils/entropy_source'
import { wait } from './utils/async'

describe('Agent', () => {
  it('collects all components without unexpected errors and makes visitorId', async () => {
    const agent = await loadAgent({ delayFallback: 0 })
    const result = await agent.get()
    expect(typeof result.visitorId).toBe('string')
    expect(result.visitorId).not.toEqual('')
    expect(typeof result.stableVisitorId).toBe('string')
    expect(result.stableVisitorId).not.toEqual('')
    expect(typeof result.confidence.score).toBe('number')
    expect(typeof result.confidence.comment).toBe('string')
    expect(typeof result.integrity.score).toBe('number')
    expect(result.integrity.score).toBeGreaterThanOrEqual(0)
    expect(result.integrity.score).toBeLessThanOrEqual(1)
    expect(Array.isArray(result.integrity.lies)).toBeTrue()
    expect(Array.isArray(result.excludedComponents)).toBeTrue()
    expect(result.version).toBe(version)

    const expectedComponents = Object.keys(sources).sort() as Array<keyof typeof sources>
    expect(expectedComponents.length).toBeGreaterThan(10) // To check the test itself
    expect(Object.keys(result.components).sort()).toEqual(expectedComponents)
    for (const componentName of expectedComponents) {
      const component = result.components[componentName]
      expect('error' in component ? component.error : undefined)
        .withContext(`Unexpected error in the "${componentName}" component`)
        .toBeUndefined()
    }
  })

  it('makes stableVisitorId from the stable components only', async () => {
    const agent = await loadAgent({ delayFallback: 0 })
    const result = await agent.get()

    const stableComponents: UnknownComponents = {}
    const excluded = new Set(result.excludedComponents)
    for (const key of stableComponentKeys) {
      if (key in result.components && !excluded.has(key)) {
        stableComponents[key] = (result.components as UnknownComponents)[key]
      }
    }
    expect(result.stableVisitorId).toBe(hashComponents(stableComponents))
  })

  it('excludes the cross-session randomized sources from the visitorId hash', async () => {
    const agent = await loadAgent({ delayFallback: 0 })
    const result = await agent.get()

    if (isBrave()) {
      expect(result.excludedComponents).toEqual([
        'canvas',
        'audio',
        'webGlBasics',
        'webGlExtensions',
        'fonts',
        'hardwareConcurrency',
        'deviceMemory',
        'plugins',
      ])
      expect(result.antiFingerprintingBrowser).toBe('brave')
    } else {
      expect(getCrossSessionRandomizedSources()).toEqual([])
      expect(result.antiFingerprintingBrowser).toBeUndefined()
    }

    // The visitor identifier must not include the excluded components
    const includedComponents: UnknownComponents = {}
    for (const key of Object.keys(result.components)) {
      if (!result.excludedComponents.includes(key)) {
        includedComponents[key] = (result.components as UnknownComponents)[key]
      }
    }
    expect(result.visitorId).toBe(hashComponents(includedComponents))
  })

  it('loads entropy sources when created', async () => {
    isSourceLoaded.x = false
    const agent = await loadAgent({ delayFallback: 0 })

    // The entropy sources may be not loaded yet at this moment of time, so we need to wait
    for (let i = 0; i < 20 && !isSourceLoaded.x; ++i) {
      await wait(50)
    }

    expect(isSourceLoaded.x).withContext('Entropy sources are not loaded').toBeTrue()
    await agent.get() // To wait until the background processes complete
  })

  it('does not send any network requests', async () => {
    const mockXHR = { open: () => undefined, send: () => undefined }
    const xmlHttpRequestSpy = spyOn(window as any, 'XMLHttpRequest').and.returnValue(mockXHR)
    const agent = await loadAgent({ delayFallback: 0 })
    await agent.get()

    expect(xmlHttpRequestSpy).not.toHaveBeenCalled()
  })
})
