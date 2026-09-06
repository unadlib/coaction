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

These are **not** from the work that repaired the gate. Nor is it the machine:
every other floor passes with room on the same run, the cached accessor getter
by seven times.

The floors stay where they are. Relaxing them to match what the code does now
would turn the one measurement that found this into a rubber stamp.

## Where it came from

Bisected with a standalone harness that measures the same scenario against
whichever core entry a checkout builds, over the 74 commits from `bd43b42`:

```
ddd4a58   45,408 ops/sec
8571387   44,633
1f15aec   44,719
f94adac   44,381
e58179a    3,802   <- feat(sync): add sync and improve coaction
```

`e58179a` is the commit that added `reactivePath.ts` and rewrote
`getRawStateStateProperty.ts`: fine-grained reactive dependency tracking, and
with it the rule that a value read inside a computed getter is an immutable
snapshot rather than a live proxy.

## What actually costs

Not the write, and not per-element dependency tracking. Measured on a store of
1,000 items, writing one field and then reading a getter:

```
write only, no getter                        450,355 ops/sec
getter sums all 1,000 items                    3,802
getter reads ONE item                          3,842
getter reads a small untouched subtree       137,082
```

A getter that reads one element costs the same as one that reads all thousand,
so it is not the reading. What it is: every state property read inside a
computed getter builds a frozen snapshot of that subtree
(`getImmutableStateSnapshot`), and after a write the subtree is a new object, so
the snapshot is rebuilt. Structural sharing keeps the elements themselves cached,
but the walk is still one pass over every key of the subtree that was touched.
Hence the cost tracks the size of what the getter reaches, not what it uses:
reading `this.items[0]` pays for all 1,000, reading `this.other.a` pays for
almost nothing.

Two things that look like fixes and are not:

- Dropping the eager whole-root snapshot that seeds the cache. It buys nothing
  measurable (4,008 against 3,993) and breaks the identity `object-valued
computed results retain public state identity` asserts.
- `whole()`, the API that exists to register one coarse dependency instead of
  per-element ones. It recovers the cost from outside a getter — 47,971 against
  4,329 for the same sum — and is a no-op inside one, because `this.items` there
  is the frozen snapshot rather than a value `publicStatePathMeta` knows. That
  is a defect of its own, and the reason the scenario as written cannot opt out.

## What would fix it

Computed reads would have to get their immutable view lazily, the way the
non-computed path already does with readonly proxies, instead of eagerly
snapshotting each subtree they touch. That is a change to the design `e58179a`
introduced, not a local repair, and it wants its own pass.
