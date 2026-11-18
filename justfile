set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

fmt:
    npm run check:write

check:
    npx tsc --noEmit
    npm run check:extension
    npm run check
    npm run test:dil

build:
    npm run build:web

# Regenerate the README snapshots (docs/images/*.png) in the pinned Linux image.
# This is the only thing that runs the @readme scenarios: `npm run e2e` covers the
# chromium project only. Rendering them on the host cannot work — the app ships no webfont,
# so the platform UI font and its text rasterizer decide the pixels, and a macOS render can
# never match the committed files.
readme-images:
    #!/usr/bin/env bash
    set -euo pipefail
    playwright_version=$(node -p "require('@playwright/test/package.json').version")
    docker build \
      -f e2e/readme-image.Dockerfile \
      --build-arg PLAYWRIGHT_VERSION="$playwright_version" \
      -t pi-web-ui-readme .
    docker run --rm -v "$PWD/docs/images:/out" pi-web-ui-readme
