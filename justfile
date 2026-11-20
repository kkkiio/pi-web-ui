set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

fmt:
    npm run check:write

# Regenerate committed codegen artifacts (e.g. extensions/examples.gen.ts).
gen:
    node scripts/gen-dil-examples.mjs

# Types and lint only: the fast gate you run while editing.
check:
    npx tsc --noEmit
    npm run check:extension
    npm run check

# Every unit test, including the conformance suite.
test:
    npm run test:dil

# What CI proves, minus the browser: check + test + build.
verify:
    just check
    just test
    just build

# The corpus is the oracle: reference artifacts vs our renderer.
conformance:
    npm run test:conformance

build:
    npm run build:web

# Offline suite with coverage: the table on stdout, lcov in coverage/lcov.info.
coverage:
    mkdir -p coverage
    node --test --experimental-test-coverage --test-reporter=dot --test-reporter=lcov \
      --test-reporter-destination=stdout --test-reporter-destination=coverage/lcov.info \
      "src/web/src/core/dil/*.test.ts" "src/web/src/components/dil/*.test.ts" \
      "extensions/*.test.ts" "evals/dil/*.test.ts"

# Run DIL evals via vitest-evals for one or more models (regenerates examples.gen.ts first).
# Provider comes from `.env` (DIL_EVAL_PROVIDER) or a `provider/model` prefix.
#   just eval                                            # all 3 default models
#   just eval glm-5.3                                    # single model
#   just eval deepseek-v4.1-flash glm-5.3                # multiple models
#   just eval opencode-go/glm-5.3                        # explicit provider/model
#   DIL_EVAL_THINKING=off just eval deepseek-v4.1-flash  # override thinking level
eval +models="deepseek-v4.1-flash glm-5.3 glm-5.3-flash": gen
    #!/usr/bin/env bash
    set -euo pipefail
    set -- {{models}}
    IFS=,
    DIL_EVAL_MODELS="$*" npx vitest run --config vitest.evals.config.ts --reporter=verbose

# Render a DIL eval run through the product renderer and open the page.
#   just preview-eval               # the last live report, else the recordings
#   just preview-eval recordings    # the committed recordings only
preview-eval mode="auto":
    #!/usr/bin/env bash
    set -euo pipefail
    if ! ls dist/assets/index-*.css >/dev/null 2>&1; then
      npm run build:web
    fi
    source="{{mode}}"
    if [ "$source" = "auto" ]; then
      if [ -f evals/dil/report.json ]; then source="report"; else source="recordings"; fi
    fi
    if [ "$source" = "recordings" ]; then
      node evals/dil/preview.mjs --recordings
    else
      node evals/dil/preview.mjs
    fi
    page="$PWD/evals/dil/preview-out/index.html"
    echo "source: $source"
    echo "preview: $page"
    case "$(uname -s)" in
      Darwin) open "$page" ;;
      Linux) xdg-open "$page" >/dev/null 2>&1 || true ;;
      *) : ;;
    esac

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

# Build the isolated Docker sandbox image used for DIL eval cases with a `projectRepo`.
eval-image:
    docker build -t pi-dil-sandbox:latest evals/dil/docker
