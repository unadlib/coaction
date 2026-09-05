---
'coaction': minor
'@coaction/react': minor
'@coaction/sync': minor
---

Track reactivity per state path, to any depth.

Dependencies used to stop at the top-level property: everything reached through
`state.user` shared one slot, so writing `user.profile.age` woke every consumer
that had read anything under `user`. Reading `state.user.profile.name` now
records a dependency on that leaf, and an unrelated sibling update no longer
re-runs the selector. Flat state shapes are unaffected -- they were already
tracked at this granularity. Dependency nodes are reference-counted and
reclaimed, and a store with no reactive consumer keeps taking the patch-free
write path.

The trade is a slower property read through the public state, since every access
goes through the tracking proxy. Reads outside a tracked scope — action bodies,
event handlers, a bare `getState()` — skip that work entirely and stay at the
cost of a plain proxy.

`whole()` is the escape hatch for the case where per-element precision is
wasted: a selector that scans a collection. It records one dependency on the
value and returns the plain object, so the scan runs at plain-object speed and
still re-runs whenever anything inside changes. Scanning a 2000-element array in
a tracked selector goes from 0.62 ms to 0.013 ms.

Also in this release:

- `@coaction/react` gains `@coaction/react/local` and `@coaction/react/shared`
  entry points, so an app that never uses a worker no longer bundles the
  transport runtime. A tracked component now releases its path nodes as soon as
  React unmounts it, instead of holding them for the uncommitted-render window.
- `@coaction/sync` is new: commit-based local-first synchronization with a
  durable optimistic snapshot and outbox, pre-hydration journaling, conflict
  policies, path-local rebase inverses, status subscriptions, retry with
  backoff, and a fetch adapter. A pending mutation that a remote change has made
  impossible to replay — its parent was deleted, say — is dropped and reported
  through `onError` rather than retried forever. A remote that acknowledges only
  part of a push hands the rest to the backoff timer instead of reporting idle
  with work still undelivered, and a storage read that throws is reported
  through `onError` without also escaping as an unhandled rejection.
