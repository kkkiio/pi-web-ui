# NOTICE — captured reference artifacts

`conformance/samples/` contains **test fixtures only**. Each sample is three files captured
from OpenAI's ChatGPT client while it rendered a DIL response:

- `<id>.source.md` — the assistant message source (model output),
- `<id>.raw.js` — the JavaScript the server compiled that source into,
- `<id>.data.json` — the client data for that message (`constants`, `appData`, `view_state`).

They are not authored by this project, they are not distributed as part of the
`@kkkiio/pi-web-ui` package (`conformance/` is excluded from `files` in `package.json`), and
they exist solely so that this project can be tested against the behaviour of the reference
implementation instead of against its own assumptions. See `conformance/README.md` for how
they are used.

If you are the rights holder and want them removed, delete `conformance/samples/` and both
`conformance/conformance.test.ts` and `conformance/derived.test.ts` will fail to find them —
the rest of the repository is unaffected.
