# DIL evals

Does the model actually answer with DIL instead of a wall of prose?

Each case is a real Pi agent session carrying the shipped `<dil>` system prompt.
Cases live in [`cases.ts`](./cases.ts), checks in [`scoring.ts`](./scoring.ts).

## Run

```bash
just eval                                               # all models
npm run eval:dil                                        # live, DeepSeek, DIL prompt
npm run eval:dil -- --provider opencode-go --model glm-5.3
npm run eval:dil -- --runs 3                           # sample variance
npm run eval:dil -- flow comparison                    # selected cases only
npm run eval:dil -- --dry                              # score the committed recordings, no key
npm run eval:dil -- --dry --record                     # refresh the recordings from a live run
```

- Credentials: `<PROVIDER>_API_KEY` in the environment, or the repo `.env`.
- A run prints a score table and writes `reports/<provider>-<model>.json`;
  `report.json` points at the latest run. `--dry` never touches these files.

## Preview

```bash
just preview-eval
```
