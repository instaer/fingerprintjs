# API reference

## Installation

The library is distributed as a private GitHub Packages module. See the [readme](../readme.md#installation)
for the `.npmrc` setup and the [publishing guide](publishing.md) for the consumer instructions.

### Webpack/Rollup/NPM/Yarn

```bash
# Configure @instaer:registry in .npmrc first, see the readme
npm i @instaer/fingerprintjs
```

```js
import FingerprintJS from '@instaer/fingerprintjs'

// Initialize an agent at application startup.
const fpPromise = FingerprintJS.load()

;(async () => {
  // Get the visitor identifier when you need it.
  const fp = await fpPromise
  const result = await fp.get()
  console.log(result.visitorId)
})()
```

CommonJS syntax:

```js
const FingerprintJS = require('@instaer/fingerprintjs')

// Initialize an agent at application startup.
const fpPromise = FingerprintJS.load()
fpPromise
  .then(fp => fp.get())
  .then(result => console.log(result.visitorId))
```

### Self-hosted distributive files

The `dist` folder of the published package contains ready-to-use bundles:
`fp.min.js` (IIFE), `fp.umd.min.js` (UMD) and `fp.esm.js` (ES module).
Copy a file to your website and include it directly:

```html
<!-- Give the file a neutral name to avoid content blocker URL rules -->
<script src="/v.js"></script>
<script>
  var fpPromise = FingerprintJS.load()
  fpPromise.then(fp => fp.get()).then(result => console.log(result.visitorId))
</script>
```

The library sends **no network requests** and collects **no usage statistics**; everything
is computed in the browser.

If you have a TypeScript error that occurs in a FingerprintJS file,
see the [TypeScript support guide](typescript_support.md).

## API

#### `FingerprintJS.load({ delayFallback?: number, debug?: boolean }): Promise<Agent>`

Builds an instance of Agent and waits a delay required for a proper operation.
We recommend calling it as soon as possible.
`delayFallback` is an optional parameter that sets duration (milliseconds) of the fallback for browsers that don't support [requestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback);
it has a good default value which we don't recommend to change.
`debug: true` prints debug messages to the console.

#### `agent.get(): Promise<GetResult>`

A method of an Agent instance that gets the visitor identifier.
We recommend calling it later, when you really need the identifier, to increase the chance of getting an accurate identifier.
The returned object format:

```ts
interface GetResult {
  visitorId: string
  stableVisitorId: string
  confidence: {
    score: number
    comment?: string
  }
  integrity: {
    score: number
    lies: readonly string[]
  }
  excludedComponents: readonly string[]
  components: {
    [key: string]:
      { value: any, duration: number } |
      { error: any, duration: number }
  }
  version: string
}
```

The returned object fields are described in detail in the [identification signals guide](#identification-signals) below.

See the [extending guide](extending.md) to learn how to remove and add entropy components.

#### `FingerprintJS.hashComponents(components: object): string`

Converts a dictionary of components (described above) into a short hash string a.k.a. a visitor identifier.
Designed for [extending the library](extending.md) with your own components.

#### `FingerprintJS.componentsToDebugString(components: object): string`

Converts a dictionary of components (described above) into human-friendly format.

## Identification signals

`agent.get()` returns several signals that answer different questions. Use them together,
not instead of each other:

| Signal | Question it answers | Drives |
|---|---|---|
| `visitorId` | Which exact browser configuration is this right now? | Primary key: exact matching, deduplication, counting |
| `stableVisitorId` | Which device is behind this? | Clustering: merging changed identifiers back to the device |
| `integrity` | Is this session lying? | Risk scoring: verification, restrictions, manual review |
| `confidence` | How trustworthy is this fingerprint itself? | Signal weighting: whether the ID can be trusted alone |

### `visitorId` — full-entropy identifier

A hash of all collected components except the ones excluded in the current environment
(see [`excludedComponents`](#excludedcomponents)). It has the highest distinguishing power,
but **any** component change flips the whole ID: a GPU driver update, a new font,
a browser upgrade, an anti-fingerprinting feature starting to randomize a source.

Use it as the primary key of your identification records: exact matching against known visitors.

```ts
if (knownVisitors.has(result.visitorId)) {
  // The exact same browser configuration as before
}
```

### `stableVisitorId` — low-variance identifier for clustering

A hash built **only** from the components that rarely change (the `stableComponentKeys` export
contains the list): timezone, languages, math, screen resolution, vendor, hardware
concurrency, etc. Volatile sources (canvas, audio, fonts, WebGL) deliberately don't participate.

It keeps the value when volatile components change, so when `visitorId` changes but
`stableVisitorId` stays the same, the visitor is most likely the same person whose
environment changed. Use it on the server as a **clustering key**:

```ts
// A driver update changed the canvas fingerprint:
//   Monday:    visitorId = a1b2c3...  stableVisitorId = xyz789...
//   Tuesday:   visitorId = f6e5d4...  stableVisitorId = xyz789...  (unchanged)
// The new visitorId joins the existing device cluster instead of creating a new visitor.
```

**Trade-off to keep in mind**: two identical machines (same model, OS, screen, region)
can produce the same `stableVisitorId`. It sacrifices uniqueness for stability, so never
use it alone for identity decisions — it's an anchor for clustering, not a proof of identity.

### `integrity` — anti-spoofing signals

Result of cross-component consistency checks (a.k.a. lie detection). The library verifies
that browser properties are coherent with each other: the user agent vs `navigator.platform`,
the GPU vs the OS, plausibility of hardware values, etc.

- `score` — a number between 0.01 and 1. The higher, the fewer signs of tampering.
  Each failed check subtracts its weight from 1: a platform mismatch costs 0.25,
  a GPU/OS mismatch 0.2, an implausible hardware value 0.05–0.1.
- `lies` — the list of detected inconsistencies as human-readable strings, e.g.
  `"osMismatch: the user agent says windows, but navigator.platform is \"MacIntel\""`.

Typical values:

| Range | Meaning |
|---|---|
| `1` | All cross-checks passed |
| `0.8–0.95` | One low-weight lie (e.g. a slightly unusual value); often a browser quirk, check `lies` for the reason |
| `0.5–0.75` | A medium-weight lie or two; suspicious |
| `< 0.5` | A high-weight lie (osMismatch, gpuMismatch) or several lies combined; almost certainly a spoofed environment |

`integrity` is not about identifying the person — it's about **convicting the session**.
A low score means the environment is probably spoofed, so treat its identifiers with
suspicion regardless of how well they match your records.

```ts
if (result.integrity.score < 0.6) {
  // Trigger verification, restrict sensitive actions, route to manual review
  // even if the visitorId matches a known good visitor — the whole environment may be forged
}
```

### `confidence` — dynamic confidence score

Tells how much information the fingerprint actually carries, i.e. the probability of the
identifier being true for this visitor. Calculated as:

```
score = platformPrior × (0.4 + 0.6 × entropyCoverage) × (0.5 + 0.5 × integrityScore)
```

- **Platform prior** — a fixed per-platform constant (desktop Chromium 0.7, Windows 0.6,
  macOS 0.5, Linux 0.7, Safari 0.3–0.5, mobile 0.4), inherited from the upstream project
  so the scores stay comparable.
- **Entropy coverage** — how much of the total entropy weight was actually collected.
  Excluded or erroring sources reduce it (canvas and audio together are ~30% of the weight).
- **Integrity** — a low integrity score decays the confidence.

Range: 0.01 to 0.99. Typical values:

| Range | Meaning |
|---|---|
| `≥ 0.6` | Strong signal: the ID can be used alone for identification |
| `0.35–0.6` | Weak signal: use the ID as a hint only, corroborate with IP/behavior/account data |
| `< 0.35` | Almost no signal: heavy anti-fingerprinting (e.g. Brave excludes 8 sources); don't make identity decisions on it |

A low confidence is **not** an accusation — it means the ID has little information, so the
collision probability with other visitors is high. The `comment` field explains the score
breakdown (e.g. `prior 0.5; entropy coverage 100%; integrity 1`) and is safe to log.

### `excludedComponents`

The sources excluded from both identifier hashes, because the current environment is known
to randomize them across sessions (e.g. Brave farbling randomizes canvas, audio, WebGL,
fonts, hardwareConcurrency, deviceMemory and plugins — the last three make the identifiers
differ between a regular window and a private window otherwise). The raw values of the
excluded sources are still collected and available in
`components` for server-side analysis. When `excludedComponents` is non-empty, expect a lower
`confidence` and treat the identifiers accordingly.

### `components`

The raw values of every collected source. Use them server-side for deep analysis:
canvas noise patterns, statistical fingerprints of spoofing farms, debugging identification
issues. Treat the type as `UnknownComponents` (see the interface comment) to stay within
Semantic Versioning.

## Combining the signals: a decision flow

The recommended server-side decision order — integrity first (don't trust a forged
environment), then exact match, then clustering, then confidence gating:

```ts
if (integrity.score < 0.8) {
  // High-risk session: trigger verification / restrictions.
  // Don't trust the identifiers, no matter how well they match — the environment may be forged.
} else if (knownVisitors.has(visitorId)) {
  // Returning visitor: the exact same browser configuration. Proceed normally.
} else if (deviceClusters.has(stableVisitorId)) {
  // A known device in a changed environment: attach the new visitorId
  // to the existing device cluster instead of creating a new visitor.
} else if (confidence.score > 0.6) {
  // A high-confidence new visitor: create a normal record.
} else {
  // Low confidence (insufficient entropy): treat the ID as a weak signal only,
  // corroborate with IP / behavioral / account data before deciding.
}
```

A complete TypeScript example of consuming the result:

```ts
import FingerprintJS from '@instaer/fingerprintjs'

const fp = await FingerprintJS.load()
const result = await fp.get()

const payload = {
  visitorId: result.visitorId,                 // exact identifier
  stableVisitorId: result.stableVisitorId,     // clustering key
  confidence: result.confidence.score,         // 0.01..0.99
  integrity: result.integrity,                 // { score, lies }
  excludedComponents: result.excludedComponents,
  components: result.components,               // optional: raw values for deep analysis
}

await fetch('/api/visitor', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})
```

**Calibrate the thresholds on your own traffic.** The 0.8 / 0.6 lines above are sensible
defaults (0.8 integrity ≈ no high-weight lie; 0.6 confidence ≈ full entropy on a mainstream
desktop), but the right cut-offs depend on your audience. Collect the scores for a while,
look at the distribution (e.g. P5/P95), then fix the thresholds.
