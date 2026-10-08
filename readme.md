<p align="center">
  <a href="https://fingerprint.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="resources/logo_light.svg" />
      <source media="(prefers-color-scheme: light)" srcset="resources/logo_dark.svg" />
      <img src="resources/logo_dark.svg" alt="FingerprintJS logo" width="312px" />
    </picture>
  </a>
</p>
<p align="center">
  <a href="https://github.com/instaer/fingerprintjs/actions/workflows/test.yml"><img src="https://github.com/instaer/fingerprintjs/actions/workflows/test.yml/badge.svg" alt="Build status"></a>
</p>

This is an optimized fork of [FingerprintJS](https://github.com/fingerprintjs/fingerprintjs) — an open-source, client-side, browser fingerprinting library that queries browser attributes and computes a hashed visitor identifier from them. Unlike cookies and local storage, a fingerprint stays the same in incognito/private mode and even when browser data is purged.

What's new in this fork (v6):

- **No install-statistics request**: the library doesn't send any network request on load
- **Runtime noise detection** in canvas and audio sources instead of skipping them by browser version, preserving full entropy where possible
- **Anti-fingerprinting resilience**: detects Brave and excludes its per-session randomized sources, so the visitor identifier stays stable across sessions
- **Layered identification**: `visitorId` (full entropy), `stableVisitorId` (low-variance components for server-side clustering), `excludedComponents` (what was excluded)
- **Integrity detection (lies detection)**: cross-source consistency checks reveal spoofed user agents, GPUs and hardware values
- **Dynamic confidence scoring**: platform prior × entropy coverage × integrity score
- **Performance**: the font detection list is trimmed per platform, reducing forced reflows

Available under the [MIT license](docs/licensing.md).

## Demo

Visit [https://instaer.github.io/fingerprintjs/](https://instaer.github.io/fingerprintjs/) to see your visitor identifier,
stable visitor identifier, confidence and integrity scores.

Now, try visiting the same page in private/incognito mode and notice that the visitor identifier remains the **same**!

Note: the identifiers produced by this fork differ from the ones produced by the original
FingerprintJS demo at https://fingerprintjs.github.io/fingerprintjs/ — the font list, canvas and
audio collection logic have changed (see "What's new" above), and visitor identifiers are not
stable across library versions in general.

## Installation

### npm (GitHub Packages)

The package is published to GitHub Packages as a private package.

Add to `.npmrc` in your project (create the file if missing):

```ini
@instaer:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Create a PAT with the `read:packages` scope and export it as `GITHUB_TOKEN`.
In CI, the built-in `GITHUB_TOKEN` works out of the box.

```bash
npm install @instaer/fingerprintjs
```

```jsx
import FingerprintJS from '@instaer/fingerprintjs'

// Initialize the agent at application startup.
const fpPromise = FingerprintJS.load();

(async () => {
  // Get the visitor identifier when you need it.
  const fp = await fpPromise
  const result = await fp.get()
  console.log(result.visitorId)        // full-entropy identifier
  console.log(result.stableVisitorId)  // low-variance identifier for clustering
  console.log(result.integrity)        // { score, lies } — anti-spoofing signals
  console.log(result.confidence)       // dynamic confidence score
})()
```

See the [identification signals guide](docs/api.md#identification-signals) for what each
signal means, its value ranges, and the recommended [decision flow](docs/api.md#combining-the-signals-a-decision-flow).

### Self-hosted script

The package `dist` folder contains ready-to-use bundles (`fp.min.js` for a `<script>` tag,
`fp.umd.min.js` for UMD, `fp.esm.js` for ES modules). Copy a file to your website
(a neutral file name reduces the chance of content blocker URL rules) and include it directly:

```html
<script src="/v.js"></script>
<script>
  // Initialize the agent at application startup.
  const fpPromise = FingerprintJS.load()

  ;(async () => {
    // Get the visitor identifier when you need it.
    const fp = await fpPromise
    const result = await fp.get()
    console.log(result.visitorId)
  })()
</script>
```

The library sends no network requests; everything is computed in the browser.

### Resources

📕 [API Reference](docs/api.md)

⚛️ [Sample usage with React on the StackBlitz platform](https://stackblitz.com/edit/fingerprintjs-react-demo)

🔑 [FingerprintJS Licensing](docs/licensing.md)

## Limitations

### Accuracy

Since FingerprintJS processes and generates fingerprints in the browser itself, the accuracy is significantly lower than in the [commercial version](https://fingerprint.com/pricing)

### Security

Because fingerprints are generated and processed in the browser, they are vulnerable to spoofing and reverse engineering.

## Want higher accuracy? Upgrade to Fingerprint Identification for free

FingerprintJS is great for getting started, but if you need production-grade accuracy for web or mobile, consider [**Fingerprint Identification**](https://fingerprint.com/products/identification/). You can [**sign up for a free account**](https://dashboard.fingerprint.com/signup) to get started.

Fingerprint Identification is a **closed-source, commercial** device intelligence platform designed to prevent fraud and improve user experiences. It's an enhanced version of FingerprintJS, fully redesigned to solve the most challenging identification use cases. Unlike FingerprintJS, it combines client-side signal collection with server-side processing. It collects over 100 browser and device signals, which are then analyzed server-side alongside network-level data, including signals that are entirely invisible to the browser, allowing it to reliably deduplicate visitors with identical devices. This server-side processing also validates that signals have not been tampered with or replayed, and generates a stable visitor identifier with **industry-leading accuracy** that is significantly harder to spoof than a purely client-side fingerprint.

Upgrading for free also unlocks access to the [Fingerprint MCP Server](https://docs.fingerprint.com/docs/mcp-server), letting your AI coding assistant build and interact directly with Fingerprint. To access [Smart Signals](https://fingerprint.com/products/smart-signals/) (device signals such as bot detection, VPN detection, and browser tampering detection), a 14-day free trial of the full platform is available.

Check out our [comparison table](docs/comparison.md) for a detailed breakdown of the differences between FingerprintJS and Fingerprint Identification.

### Fingerprint Identification resources

🍿 [Fingerprint Identification live demo](https://demo.fingerprint.com/playground)

📕 [Fingerprint Identification documentation](https://dev.fingerprint.com)

▶️ [Video: Use Fingerprint Identification to prevent multiple signups by the same user](https://www.youtube.com/watch?v=jWX9P5_jZn8)

⏱️ [How to upgrade from FingerprintJS to Fingerprint Identification in 30 seconds](https://dev.fingerprint.com/docs/migrating-from-fingerprintjs-to-fingerprint-pro)

## Migrating to v5

| Migrating from | Migration Guide | Documentation |
|----------|-----------|-----------|
| **v4** | [Migrating from v4 to v5](docs/migration/v4_v5.md) | [v4 documentation](https://github.com/fingerprintjs/fingerprintjs/tree/v4) |
| **v3** | [Migrating from v3 to v5](docs/migration/v3_v5.md) | [v3 documentation](https://github.com/fingerprintjs/fingerprintjs/tree/v3) |

## Version policy

See the compatibility policy for the API and visitor identifiers in the [version policy guide](docs/version_policy.md).

## Supported browsers

The library supports all popular browsers. See more details and learn how to run the library in old browsers in the [browser support guide](docs/browser_support.md).

## Where to get support

Using [Issues](https://github.com/fingerprintjs/fingerprintjs/issues) and [Discussions](https://github.com/fingerprintjs/fingerprintjs/discussions) publicly will help the community and other users with similar issues.

You can also join our [Discord server](https://discord.gg/ad6R2ttHVX) to ask questions, share feedback, and connect with other developers.

If you require private support for FingerprintJS, please email us at [oss-support@fingerprint.com](mailto:oss-support@fingerprint.com).

## Contributing

See the [Contribution guidelines](contributing.md) to learn how to contribute to the project or run the project locally.
Please read it carefully before making a pull request.
