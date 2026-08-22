set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

fmt:
    npm run check:write

check:
    npx tsc --noEmit
    npx tsc --noEmit -p tsconfig.hub.json
    npx tsc --noEmit -p tsconfig.extension.json
    npm run check

build:
    npm run build:web
    npm run build:hub