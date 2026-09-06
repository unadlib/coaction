# Benchmark gate

`pnpm benchmark:check` measures `scripts/check-benchmark-regression.mjs` against
the floors in `benchmark-regression-thresholds.json`.

## It was dark for a while

The script imported `packages/core/dist/local.mjs`. That entry was removed when
`coaction` became the local runtime and `coaction/shared` the transport one, so
from that commit until this one the gate could not start at all — and it only
runs on pull requests carrying the `run-ci` label, so nothing reported it.

## Two floors it fails on the first run back

```
Coaction mutable update + cached getter   3,741 / 45,000 ops/sec
Coaction mutable update + manual deps     3,697 / 45,000 ops/sec
```

These are **not** a regression from the work that repaired the gate. The same
scenario measures 3,762 ops/sec at `440c7d0`, before any of it, and 3,769 after
— the shortfall is entirely older than that. Nor is it the machine: every other
floor passes with room on the same run, the cached accessor getter by seven
times.

What is not established is where in history it came from, or whether
`index.mjs` ever met a floor that was calibrated against `local.mjs`. That is a
performance investigation of its own.

The floors are left where they are. Relaxing them to match what the code does
now would turn the one measurement that found this into a rubber stamp.
