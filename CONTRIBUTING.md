# Contributing

Thanks for helping. Bug reports, new database adapters and fixes are all welcome.

```bash
npm install
npm test           # spins up real Postgres (PGlite) and MongoDB in-process; no setup
npm run typecheck
npm run build
```

## Adding a database

1. Add `src/adapters/<name>.ts` exporting a function that returns an `Adapter`
   (`src/core/types.ts`): `record`, `days`, `visitors`, `firstDay`.
2. Add it to the entries in `tsup.config.ts` and the `exports` in `package.json`.
3. Add a `contract('<name>', ...)` block to `test/adapters.test.ts`. The shared suite checks
   per-day counts, breakdowns, ranges, cross-day unique visitors and the history merge. Prefer
   an in-process or downloadable real server over a mock.
4. Add a row to the Databases table in the README.

Keep the stored data free of anything that identifies a person: no IPs, no user agent strings.
