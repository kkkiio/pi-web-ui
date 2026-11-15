# README images are committed snapshots whose bytes depend on the platform that rendered
# them: the app ships no webfont, so `Inter, ui-sans-serif, system-ui, …` resolves to the
# platform UI font (SF Pro on macOS, DejaVu on Linux) and each OS rasterizes text its own
# way. Images rendered anywhere but here cannot match the committed files, so this is the
# only place they are produced. Do not add or upgrade fonts, and expect every image to change
# whenever PLAYWRIGHT_VERSION moves to a new base image: regenerate all of them in the same
# commit so the snapshot diff stays explainable.
ARG PLAYWRIGHT_VERSION
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

# This image ships no Latin UI font: `system-ui` and `sans-serif` resolve to WenQuanYi Zen Hei
# (a CJK face with a regular weight only), so Latin text renders in a CJK face and every bold
# is synthesized. Install Inter — the first family in the app's font stack — and point the
# generic UI names at it so the snapshots show the design's typeface with real weights.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-inter \
 && rm -rf /var/lib/apt/lists/* \
 && printf '%s\n' \
      '<?xml version="1.0"?>' \
      '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">' \
      '<fontconfig>' \
      '  <match target="pattern">' \
      '    <test name="family"><string>system-ui</string></test>' \
      '    <edit name="family" mode="assign" binding="strong"><string>Inter</string></edit>' \
      '  </match>' \
      '  <match target="pattern">' \
      '    <test name="family"><string>ui-sans-serif</string></test>' \
      '    <edit name="family" mode="assign" binding="strong"><string>Inter</string></edit>' \
      '  </match>' \
      '  <alias binding="strong">' \
      '    <family>sans-serif</family>' \
      '    <prefer><family>Inter</family></prefer>' \
      '  </alias>' \
      '</fontconfig>' > /etc/fonts/conf.d/60-pi-web-ui-latin.conf \
 && fc-cache -f

WORKDIR /app
ENV CI=1

COPY . .
RUN npm ci --no-audit --no-fund
RUN npm run build:web

# The Playwright image runs as `pwuser`; the bind mount for /out is owned by the host user,
# so render as root to keep the copy simple (Docker Desktop maps the result back to the host
# user on macOS).
USER root

# `/out` is the host's docs/images, mounted by `just readme-images`.
CMD ["sh", "-ec", "npx bddgen test -c e2e/playwright.config.ts && npx playwright test -c e2e/playwright.config.ts --project=readme && cp docs/images/*.png /out/"]
