# @coaction/react

## 4.0.0

### Major Changes

- `@coaction/react` requires React 18 or 19. The peer range used to include 17,
  and nothing tested it: installing React 17 turns eight of the suite red,
  because the test setup needs 18 and the hydration tests need `hydrateRoot`.
  A CI matrix now installs each version the range claims and runs the suite
  against it. The runtime still reads through `use-sync-external-store/shim`, so
  React 17 may well work — it is simply not verified.

- On the server, `useStore(selector)` reads the current state. It read the
  initial state, while `useStore()` and `observer` read the current one, so a
  store written to before rendering produced two different values for the same
  field and neither matched what the client hydrated against. If you relied on
  a selector returning the initial state during SSR, read `getInitialState()`.

- fa03a28: `coaction` is now the local runtime, and `coaction/local` is gone. Shared and
  client stores import `create` from `coaction/shared`.

  The default import decided what a bundle carried, and it decided wrong for
  almost everyone: `coaction` reached the transport runtime, so `data-transport`
  — 27 KB minified — landed in every application that wrote
  `import { create } from 'coaction'`, whether or not a Worker was ever involved.
  A React application measured 30.1 KB gzip that way and 18.2 KB through
  `coaction/local`: the same program, 40% smaller, chosen by a line the docs
  barely mentioned.

  `coaction/shared` is unchanged — it was already the full build, byte for byte
  identical to the root entry — so code that creates shared stores changes one
  import and nothing else. `coaction/local` becomes `coaction`.

  `@coaction/react/local` is removed for the same reason: it was an explicit alias
  of a default that is now unambiguously the local runtime.
  `@coaction/react/shared` is unchanged.

  Passing `worker`, `transport`, `clientTransport`, `transportPolicy` or `share`
  to the default entry throws with the entry to switch to. See
  `docs/migration/default-entry-is-local.md`.

- e58179a: `@coaction/react` now links the local runtime. Worker and cross-context stores
  move to `@coaction/react/shared`.

  The default entry used to carry the transport protocol whether or not a worker
  was ever created — about 12 KB gzip in a minimal app, paid by every application
  that imported React state. A minimal app goes from 31.9 KB to 19.9 KB gzip.

  Only code passing `worker`, `transport`, `clientTransport`, `transportPolicy`,
  `workerType` or `executeSyncTimeoutMs` to `create` from `@coaction/react` has to
  change, and the change is the import:

  ```diff
  - import { create } from '@coaction/react';
  + import { create } from '@coaction/react/shared';
  ```

  Both sides of a shared store — the worker module and the page — take the same
  entry. TypeScript reports the mistake at the call site, and the runtime error
  names the entry to switch to. See `docs/migration/react-entry-points.md`.

  An option whose value is `undefined` or `null` is no longer treated as a request
  for the shared runtime. `{ worker: maybeWorker }` where the worker is absent —
  feature detection, an SSR guard — degrades to a local store on any entry, which
  is what that code wants. Note that a store created from the shared entry keeps
  async actions in that fallback, because they may cross a worker boundary; the
  local entry's are synchronous.

### Minor Changes

- e58179a: Track reactivity per state path, to any depth.

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

  - `@coaction/react` gains a `@coaction/react/shared` entry point, so an app that
    never uses a worker no longer bundles the transport runtime. A tracked component now releases its path nodes as soon as
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

### Patch Changes

- 3be75d1: A third review pass, mostly about what happens at a crash boundary and at the
  seams between the core and its adapters.

  **CRUD handlers now receive the mutation a write carries.** The outbox gives each
  mutation a stable id so a remote that dedupes on it makes a retry after a crash
  safe; the handlers took only a record, so no CRUD-based adapter could honour the
  contract the README described. `create`, `update` and `delete` take a second
  argument with the operation, the record, the queued mutation ids, and a stable
  `idempotencyKey`.

  **Supabase creates survive their own replay.** `insert()` met its own row after a
  crash between the remote committing and the acknowledgement persisting, and
  failed forever on a unique constraint. It is now an upsert on the id column.

  **The adapter's view of the remote advances only when the store takes a result.**
  A new `SyncAdapter.accept(result)` runs after the rebase and before the
  checkpoint, so a pull discarded as stale, or a subscription arriving mid
  hydration, no longer leaves the adapter describing a remote the store never
  accepted.

  **Firestore realtime updates the baseline**, which it did not while Supabase's
  did — a document learned about only through `onSnapshot` could be deleted
  locally with no `deleteDoc` ever sent. A removal from a narrowed read does not
  count, since leaving a query is not leaving the collection.

  **Supabase `schema` applies to reads and writes**, not just the realtime filter,
  which previously watched one table while reading and writing another. A
  non-default schema now requires a client exposing `schema()`.

  **Supabase pulls page by key rather than by offset**, so a row deleted mid-pull
  no longer pushes the row behind it out of an authoritative snapshot, and the
  record ceiling is checked before the loop ends rather than after.

  **`sync()` refuses a runtime with nowhere durable to write.** `localStorage` was
  checked on every call and silently skipped when absent, so a Worker — the
  environment this library exists to support — ran with a memory-only outbox while
  calling it durable. Pass `storage: false` to choose that deliberately.

  **`@coaction/react` compares carried state values by identity as well as
  version.** A version is a sum of path versions, so two untouched siblings share
  one: a reused wrapper swapping between them compared equal and skipped the
  render.

  **A remote fact counts when it arrives, not when it finishes applying.** A
  successful push that answered without patches never advanced the staleness
  guard, so a pull already in flight was judged current on return and rolled back
  a write the remote had committed and the outbox had acknowledged — and `{}` is
  what every built-in CRUD adapter returns from `push`. The check was also a
  check-then-act, so a subscription that had arrived and was still queued left it
  unchanged too. The epoch now moves on arrival, the check runs inside the apply
  lane, and every push result goes through that lane whether or not it carries
  patches.

  **CRUD writes return what the backend made of them.** A `create` or `update`
  that answers with the stored record now produces patches, so the store stops
  disagreeing with the row it just wrote until some later pull corrects it.

  **Delivery semantics are written down.** Mutations are at-least-once, and the
  built-in Supabase and Firestore adapters are last-write-wins under replay —
  retry-safe, which is not the same as idempotent. The README shows the replay
  that surprises people and what a handler built on `idempotencyKey` looks like
  instead.

  **A Supabase full pull can decline to be authoritative.** Keyset paging removed
  offset drift; it does not make several requests one snapshot, so
  `authoritativeList` is now an option rather than a derived value.

  **A mutation's idempotency key no longer changes when it is reclassified.** The
  key included the operation, which is decided against the adapter's baseline at
  send time — so a create whose answer was lost, retried after realtime reported
  the row it made, went out as an update under a different key. A ledger keyed on
  the first one would apply the write twice, which is the failure the key exists
  to prevent.

  **Authoritative deletions come from the durable baseline, not the current
  store.** With `persistState: false` a restarted store is empty, so a record the
  remote had dropped produced no removal and the baseline kept claiming it; and a
  record created locally but never sent produced a removal for something the
  remote never had, which only the default conflict policy was undoing.

  **State has to be JSON, and saying so beats rewriting it.** Everything persisted
  goes through `JSON.stringify`, while Coaction's local core does not require
  JSON — so a `Date` came back a string, a `Map` came back `{}`, and nothing said
  so until something downstream read the wrong type. `sync()` now refuses such
  state with the path to the value, checks each commit's patches, and encodes
  inside the queued write so a `BigInt` or a cycle fails the write instead of
  throwing back out of the `set()` that already committed.

  **A push answer overtaken by something newer is not applied.** Arrival order is
  not commit order: an answer describing what the server made of an earlier write
  would put that value back over an edit that has since arrived. The
  acknowledgement stands; the state it describes is left to a pull.

- 7d98c5f: Corrections to `@coaction/sync` from a second external review, all of them
  reproduced before being fixed.

  **The CRUD adapter now remembers what the remote holds.** That knowledge decided
  create versus update and lived only in memory, while the outbox it interpreted
  was durable — so after a restart, editing a record pulled in an earlier session
  sent `create` (a primary key collision on any backend that has one), clearing a
  collection sent nothing at all and acknowledged the mutation anyway, and a
  record that arrived by realtime was never seen by the adapter at all. The
  baseline is now written into the same checkpoint as the outbox through two new
  optional `SyncAdapter` hooks, `serialize()` and `hydrate()`.

  **A missing CRUD handler fails the push instead of acknowledging it.** A mutation
  needing an operation the adapter was not given was skipped, and the push then
  returned normally — which the protocol reads as "the remote took everything".
  It now throws `UnsupportedCrudOperationError` and the mutation stays queued.

  **Every remote result is applied through one ordered lane.** Pull, push answers
  and subscriptions each applied independently, so two rebases could interleave.
  A pull is additionally re-asked when the state it was computed against has
  moved, since its answer describes a base that is gone.

  **Supabase full pulls are paged**, so the response cap can no longer be mistaken
  for the whole table and delete everything past it, and the changes-since cursor
  now names a row rather than an instant, so rows sharing a timestamp are not
  stepped over.

  **Firestore separates its read source from its write address.** `collection` must
  be a `CollectionReference`, since writes go through `doc(collection, id)`; pass
  a `Query` as the new `query` option to read something narrower, which also stops
  the pull being authoritative.

  **A reused selector wrapper no longer hides changes inside it** in
  `@coaction/react`: a wrapper the selector returns every time compared equal
  forever, because only a directly returned state value had its version compared.

- Updated dependencies
- Updated dependencies [d393227]
- Updated dependencies [e58179a]
- Updated dependencies [8dfbe1b]
- Updated dependencies [fa03a28]
- Updated dependencies [ccea3c9]
- Updated dependencies [e58179a]
- Updated dependencies [3be75d1]
  - coaction@4.0.0

## 3.2.1

## 3.2.0

### Minor Changes

- 7d77649: Fix client-store type inference in framework creators. Options carrying
  `worker` or `clientTransport`, including through object spreads, now preserve
  the async client action types. Calls without client transport options remain
  synchronous, and `getInitialState()` retains the original synchronous
  initialization shape.

## 3.1.0

### Patch Changes

- Added real-browser SharedWorker and Web Worker coverage for the React binding,
  validating cross-page component updates, async client actions, and safe remote
  error redaction.
- Aligned the peer dependency with Coaction 3.1's authoritative patch commit and
  replay pipeline.
- Updated dependencies
  - coaction@3.1.0

## 3.0.0

### Major Changes

- 9a43c82: Adopt a JSON-only shared-store contract and versioned string wire protocol.
  Shared state, action arguments/results, patches, and snapshots now reject
  non-JSON or lossy JavaScript values before transport. Client mirrors use
  authority epochs and contiguous sequences to recover reconnects and update
  gaps, while remote execution is limited to declared action paths and optional
  transport policy.

  Add static `coaction/local`, `coaction/shared`, and `coaction/adapter` entry
  points. Adapter-authoring helpers move from the root export to
  `coaction/adapter`; official adapters now expose plain JSON transport snapshots
  without linking adapter internals into the core runtime.

### Patch Changes

- Updated dependencies [9a43c82]
  - coaction@3.0.0

## 2.1.0

### Patch Changes

- Aligned the React binding peer dependency with Coaction 2.1's fixed-schema and mutable-adapter synchronization guarantees.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Added `observer()` and `<Observer>` for automatic render dependency tracking without explicit selectors.
- Rebuilt React selector subscriptions on Coaction 2.0's signal-backed computed state so selector results are cached per subscription and only notify when their selected value changes.
- Added versioned multi-store selector snapshots for `createSelector()` so selectors spanning multiple stores do not reuse stale snapshots.

### Patch Changes

- Cached selector snapshots that return objects and isolated selector subscription state across concurrent subscribers.
- Synchronized observer tracker snapshots and refreshed mutable adapter object reads for MobX, Pinia, and Valtio-backed stores.
- Treated non-plain objects and arrays as auto-selector leaves, recursed through plain object auto-selectors, included symbol keys, and ignored non-enumerable keys.
- Updated creator typings for object single-store creators and async client method returns.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Reworked `autoSelector` to return cached selector maps through `useStore.auto()` and `useStore({ autoSelector: true })` instead of hiding hook calls inside property getters.
- Stopped auto-selector expansion on recursive object graphs and documented that dynamically added keys should use explicit selectors.
- Fixed full-state React subscriptions for mutable adapters so MobX, Pinia, and Valtio-backed stores rerender correctly for full-state readers and selectors.
- Aligned the peer dependency with `coaction@^1.5.0`.

## 1.4.1

### Patch Changes

- Aligned the peer dependency with `coaction@^1.4.1`.

## 1.4.0

- Aligned the peer dependency with `coaction@^1.4.0`.
- Clarified the React 17/18/19 compatibility contract around the continued use of `use-sync-external-store/shim`.

## 1.3.0

- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Fixed `autoSelector` generation to iterate only over own keys.
- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- Promoted the React binding to the 1.x line.
- Expanded selector and `autoSelector` integration coverage.

## 0.1.5

- Version-alignment release with no package-specific source changes.

## 0.1.4

- Version-alignment release with no package-specific source changes.

## 0.1.3

- Version-alignment release with no package-specific source changes.

## 0.1.2

- Version-alignment release with no package-specific source changes.

## 0.1.0

- Initial release of the React adapter.
- Added selector helpers, including `createSelector` and auto-selector support.
- Added the React example and followed up with early integration fixes.

## Unreleased

- Remove the recursive full-state touch from React store notifications; observer tracking now benefits from core deep path invalidation.
