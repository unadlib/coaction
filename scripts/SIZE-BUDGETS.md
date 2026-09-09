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

## Final 4.0 correctness qualification

The final correctness audit added complete producer-patch certification, cached
computed failures, and ordered commit delivery that survives observer errors and
reentrant writes. Bounded read sets can compare observed paths directly when no
patch consumer needs a journal. This recovers reader-write throughput while
retaining full certification whenever patches are consumed.

The default core consumer measures **10,945 bytes gzip**, compared with the
earlier baseline of 9,817 bytes and ceiling of 10,650. The shared consumer, which
contains the same mutation runtime, measures **15,142 bytes**, compared with its
13,971-byte baseline and 15,100-byte ceiling. These corrections exceed the old
ceilings by 295 and 42 bytes respectively. The new baselines record both costs
explicitly; the **11,200- and 15,500-byte ceilings** leave 255 and 358 bytes of
headroom.

This is a deliberate final release freeze for these correctness contracts. The
other entry budgets and all performance floors retain their existing limits.
Single scalar replacements use a direct certificate, while compound and non-tree
transitions retain full replay/snapshot verification. Consumer fixtures and
externalized dependencies are unchanged, so these are comparable measurements.
