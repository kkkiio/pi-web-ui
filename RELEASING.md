# Releasing

This document is the source of truth for publishing `@kkkiio/pi-web-ui` to npm and verifying the Pi package catalog entry.

## Release Policy

- Publish from a reviewed commit on the intended release branch.
- Keep `dist/` out of git. `npm publish` runs `prepack`, which runs `npm run build:web` and includes `dist/` in the npm tarball.
- Do not run `npm publish` until the package contents have been checked with `npm pack --dry-run --json`.
- Treat package media as part of the release. If `README.md` references local images, those files must be included in `package.json.files`. If pi.dev should show a card preview, `package.json` must provide `pi.image`.

## Prerequisites

Use Node.js 18 or newer and an npm account that can publish `@kkkiio/pi-web-ui`.

```bash
node --version
npm --version
npm whoami
```

Install dependencies before running checks:

```bash
npm install
```

## Pre-Release Checks

Start from the repository root:

```bash
pwd
git status --short
git branch --show-current
```

Confirm package metadata:

```bash
npm view @kkkiio/pi-web-ui version
npm pkg get name version description repository pi files publishConfig
```

Run the project checks:

```bash
just check
npm run build:web
```

## Package Media Checks

pi.dev uses two different image paths:

- Search result cards use `package.json` `pi.image`.
- README images are rendered through npm CDN paths, so local README image files must be present in the published tarball.

Before publishing, verify that `package.json` includes a stable `pi.image` URL if a catalog card image is expected. For this package, prefer the GitHub raw URL for the README screenshot:

```json
"pi": {
  "extensions": [
    "./extensions/mirror-server.ts"
  ],
  "image": "https://raw.githubusercontent.com/kkkiio/pi-web-ui/main/docs/images/pi-web-ui-example.png"
}
```

If `README.md` contains:

```markdown
![Pi Web UI example](docs/images/pi-web-ui-example.png)
```

then `package.json.files` must include `docs/images/`:

```json
"files": [
  "extensions/",
  "dist/",
  "public/",
  "docs/images/",
  "README.md"
]
```

## Dry Run

Run npm's pack dry run and inspect the generated file list:

```bash
npm pack --dry-run --json
```

The output must include at least:

- `README.md`
- `package.json`
- `extensions/mirror-server.ts`
- `dist/index.html`
- `dist/assets/`
- `public/`
- `docs/images/pi-web-ui-example.png` when README references that image

Check the CDN path that pi.dev will use for README images after publish. Replace `<version>` with the version being released:

```bash
curl -I -L https://cdn.jsdelivr.net/npm/@kkkiio/pi-web-ui@<version>/docs/images/pi-web-ui-example.png
```

For an unpublished version this may return 404 before publishing. After publishing it must return 200.

## Versioning

Bump the version intentionally. Use `patch`, `minor`, or `major` according to the change:

```bash
npm version patch --no-git-tag-version
```

Review the diff after the version bump:

```bash
git diff -- package.json package-lock.json
```

Commit release changes with a Conventional Commits message:

```bash
git add package.json package-lock.json RELEASING.md AGENTS.md
git commit -m "chore: prepare release"
```

If the release contains code or documentation changes beyond version metadata, include those files in the same reviewed release commit or in earlier commits.

## Publish

Run the final checks immediately before publishing:

```bash
just check
npm pack --dry-run --json
```

Publish to npm:

```bash
npm publish --access public
```

Create and push the release tag after npm publish succeeds. Replace `<version>` with the published version:

```bash
git tag v<version>
git push origin HEAD
git push origin v<version>
```

## Post-Publish Verification

Confirm npm registry metadata:

```bash
npm view @kkkiio/pi-web-ui version dist.tarball pi files --json
```

Confirm the README image is available through jsDelivr. Replace `<version>` with the published version:

```bash
curl -I -L https://cdn.jsdelivr.net/npm/@kkkiio/pi-web-ui@<version>/docs/images/pi-web-ui-example.png
```

Confirm pi.dev preview media. This should return a non-null `media` object when `pi.image` is set:

```bash
curl -L 'https://pi.dev/api/packages/preview-media?name=%40kkkiio%2Fpi-web-ui'
```

Open the package pages and verify both the search card image and README image render:

- https://pi.dev/packages?name=web-ui
- https://pi.dev/packages/@kkkiio/pi-web-ui?name=web-ui

If pi.dev still shows stale data, wait for registry and CDN caches to refresh, then retry the verification commands.

## Failed Publish or Bad Release

If `npm publish` fails before publishing a version, fix the issue, rerun the dry run, and publish again.

If a bad version is already published:

1. Do not overwrite the published version.
2. Fix the issue in a new commit.
3. Bump to a new patch version.
4. Publish the new version.
5. If the bad version is dangerous, deprecate it with a clear message:

```bash
npm deprecate @kkkiio/pi-web-ui@<bad-version> "Use @kkkiio/pi-web-ui@<fixed-version>; this release has broken package metadata."
```
