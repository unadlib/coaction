# Size budgets

`pnpm package:size` measures the gzipped size of every published entry against
`package-size-budgets.json`, and the size of a consumer bundle built from the
core entries against `core-entry-size-budgets.json`.

Each entry has two numbers. `baselineGzipBytes` is what it measured at the last
deliberate freeze; `maxGzipBytes` is the ceiling that fails the build. The
report prints the delta from the baseline whether or not the ceiling is
breached, so drift is visible before it is a failure.

## Frozen at 4.0.0

Every baseline in both files was set from the 4.0.0 release build, with ceilings
about eight per cent above. Before that they had been moved one entry at a time
as work landed, which let the core entry drift more than a kilobyte under its
ceiling without anything saying so — the report showed it, and the build stayed
green, and nobody looked.

## Moving a baseline

A baseline moves when the size it records is no longer what the code is. That is
a deliberate act with a reason, stated where the reason belongs:

- **Say what was added.** A number that moves without an explanation in the same
  commit is indistinguishable from one that moved to silence a failure.
- **Check what grew.** Runtime bundles retain legal notices and tree-shaking
  annotations. API JSDoc stays in declarations instead of being duplicated in
  JavaScript. This packaging change reduces the raw artifact measurements
  without changing the frozen ceilings. The core consumer fixtures measure
  retained Coaction code with `alien-signals`, `data-transport` and `mutative`
  externalized; they are not dependency-inclusive application bundle sizes.
- **Never move a ceiling to pass a build.** Raising `maxGzipBytes` without
  raising `baselineGzipBytes` hides the growth from the report as well as from
  the build.

Between releases, growth is expected to be small and explained. At a release,
the baselines are frozen again from the release build.
