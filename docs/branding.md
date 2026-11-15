# Pi Web UI logo

The logo is a silk-thread **P**: blue (`#4D9ABF`) strands with a coral
(`#F09082`) endpoint, on a transparent background.

- `public/logo.svg`: three strands for the page header and empty state.
- `public/favicon.svg`: two thicker strands for browser tabs and install icons.
- `public/icons/pi-web-ui-maskable.svg`: the two-strand mark scaled to 70% on
  an opaque warm background (`#f5f3ef`). The extra space keeps the mark inside
  the maskable icon's central safe circle. This background is only for OS
  icon masks; the website logo and favicon remain transparent.

The SVGs are the editable sources. Regenerate the PNG install icons with
[Inkscape](https://inkscape.org/) from the repository root:

```bash
inkscape public/favicon.svg --export-width=192 --export-filename=public/icons/pi-web-ui-192.png
inkscape public/favicon.svg --export-width=512 --export-filename=public/icons/pi-web-ui-512.png
inkscape public/icons/pi-web-ui-maskable.svg --export-width=512 --export-filename=public/icons/pi-web-ui-maskable-512.png
```

Check the favicon at 16px and 32px, and the page logo on light and dark themes,
when changing the paths or colors.
