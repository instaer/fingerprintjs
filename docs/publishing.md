# How to publish

This guide is for repository maintainers. The package is published to
[GitHub Packages](https://docs.github.com/en/packages) as a **private** npm package
(`@instaer/fingerprintjs`), so only people with access to this repository can install it.

## Publishing a new version

1. Create a PR that bumps the version in [package.json](../package.json).
2. [Build the project](../contributing.md#how-to-build) on your local machine and run `yarn pack`.
    An archive will be created nearby in the repository root directory.
    Open the archive and make sure it contains the distribution files and no excess files.
    If there is something wrong, fix it and push to the PR.
3. When the PR checks succeed and the PR is approved, merge it to `master`.
4. Run the [Publish to GitHub Packages](https://github.com/instaer/fingerprintjs/actions/workflows/npm_publish.yml)
    workflow by using the "Run workflow" button.
    It will build the project, publish the package to `npm.pkg.github.com` using the built-in
    `GITHUB_TOKEN` (no extra secrets required) and push a `v<version>` Git tag.
    The npm dist-tag is derived automatically from the package version,
    for example `1.2.3` gives `latest` and `1.2.3-alpha.1` gives `alpha`.
5. Describe the version changes in the [releases section](https://github.com/instaer/fingerprintjs/releases)
    under the corresponding tag.

## Installing the package

Consumers need a PAT with the `read:packages` scope.

Add to `.npmrc` in the consumer project:

```ini
@instaer:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Export the token: `export GITHUB_TOKEN=<your PAT>`, then `npm install @instaer/fingerprintjs`.

In GitHub Actions CI of the consumer repository, the built-in `GITHUB_TOKEN` works
out of the box (add `permissions: packages: read` to the workflow).
