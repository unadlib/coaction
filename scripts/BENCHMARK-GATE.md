# Benchmark gate

`pnpm benchmark:check` measures `scripts/check-benchmark-regression.mjs` against
the floors in `benchmark-regression-thresholds.json`.

## It was dark for a while

The script imported `packages/core/dist/local.mjs`. That entry was removed when
`coaction` became the local runtime and `coaction/shared` the transport one, so
from that commit until this one the gate could not start at all — and it only
runs on pull requests carrying the `run-ci` label, so nothing reported it.

## What it found, and what came of it

On the first run back it reported two floors failing by twelve times:

```
Coaction mutable update + cached getter   3,741 / 45,000 ops/sec
Coaction mutable update + manual deps     3,697 / 45,000
```

Bisected with a standalone harness over the 74 commits back to where the floors
were set, it lands on one commit:

```
f94adac   44,381 ops/sec
e58179a    3,802   <- feat(sync): add sync and improve coaction
```

### The cause

A computed getter reads state through a frozen snapshot of the subtree it
touches, cached by object identity, and that is unchanged from before
`e58179a` -- the branch that builds it is character-for-character the same. What
changed is that the snapshot stopped being carried forward.

Carrying it forward is cheap: walk the patch paths and re-map the objects along
them, proportional to the change. That code existed, in the `setState` fast
path. `e58179a` added `!hasReactivePathNodes(internal)` to the conditions that
path requires, and a store whose computed getter has ever been read has reactive
path nodes -- so the maintenance stopped running the moment the feature it
serves was used, and every read after every write rebuilt the snapshot instead.

It now runs at the commit point, where every write passes rather than only the
one path that had been excluded from doing it. Measured on a store of a thousand
items:

```
                                        before      after
getter summing all thousand              3,837     41,972
getter reading one field                 3,993     67,081
same, over four thousand items           1,043     34,413
```

### What is left, and why the floors moved

38,000 against a floor of 45,000. The remaining difference is the write, not the
read: once reactive path nodes exist, a write can no longer take the patch-free
fast path, because invalidating those paths needs patches.

```
write only, getter never read (fast path)      442,453 writes/sec
write only, getter read once                    67,702
```

That is the cost of the tracking `e58179a` introduced, and the floors were
measured the commit before it existed. They are now set to 30,000, which is a
different act from relaxing them last round would have been: then the shortfall
was unexplained, and moving the floor would have erased the only measurement
that had found it. It is now diagnosed, eleven twelfths of it repaired, and the
remainder attributed to a feature that is doing real work.

### One thing this file previously got wrong

An earlier version of this note called `whole()` being a no-op inside a computed
getter "a defect of its own". It is not. Tracking inside a getter is already
coarse -- writing `items[2]` re-runs a getter that read `items[0]`, and writing
an unrelated field does not -- so the coarse dependency `whole()` exists to
register is the one already being registered. There is nothing for it to do
there.
