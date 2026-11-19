# NOTICE — captured reference artifacts

`conformance/scenarios/` and `conformance/corpus/` contain **test fixtures only**. Each sample is three files captured
from OpenAI's ChatGPT client while it rendered a DIL response:

- `<name>.dil.md` — the assistant message source (model output),
- `<name>.raw.js` — the JavaScript the server compiled that source into,
- `<name>.data.json` — the client data for that message (`constants`, `appData`, `view_state`).

They are not authored by this project, they are not distributed as part of the
`@kkkiio/pi-web-ui` package (`conformance/` is excluded from `files` in `package.json`), and
they exist solely so that this project can be tested against the behaviour of the reference
implementation instead of against its own assumptions. See `conformance/README.md` for how
they are used.

If you are the rights holder and want them removed, delete `conformance/scenarios/` and
`conformance/corpus/`: the conformance tests will then fail to find their inputs, and the
rest of the repository is unaffected.
