# coaction

## 4.0.0

### Major Changes

- `store.apply` belongs to Coaction on every store, and an external adapter now
  says only how to write into its own runtime.

  An adapter used to replace `store.apply` outright. That handed it commit
  semantics it did not want: none of them published a commit, so `store.apply()`
  on a MobX, Valtio or Pinia store changed the state and told nobody —
  `@coaction/history` had nothing to undo and `@coaction/sync` never queued it.
  Putting the commit pipeline back around whatever an adapter installed then
  produced three separate ways to publish the same transition twice, each found
  and fixed in turn. And because middleware runs before the binder, replacing
  `apply` silently discarded anything middleware had wrapped it with.

  An adapter now sets `internal.externalApply` — how to get a change onto its
  runtime, and nothing else. Coaction works out the patch pair before the change,
  runs commit validators, calls the writer, and publishes the commit, in one place
  for every adapter. Middleware that wraps `store.apply` keeps working on stores
  built through a binder.

  **If you maintain a third-party adapter**, replace `store.apply = writer` with
  `internal.externalApply = writer`. The signature is unchanged. Do not publish a
  commit from it; Coaction does that.

  `store.apply(state, patches)` also now requires `state` to be the state the
  store holds — omit it, or pass `getPureState()`. A patch pair describes a change
  to the current state, so applying it to anything else left the store somewhere
  its own commits did not lead.

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

### Patch Changes

- d393227: `store.apply(state, patches)` now refuses a `state` that is not the one the
  store holds.

  A patch pair describes a change to the current state — that is what the pair
  means and what the commit built from it says. Applying it to something else
  leaves the store somewhere its own commits do not lead: `apply({ a: 10, b: 0 },
[b → 1])` on `{ a: 0, b: 0 }` produces `{ a: 10, b: 1 }` while the commit replays
  to `{ a: 0, b: 1 }`, and nothing reading commits can tell.

  `Store.apply` was always documented as applying patches to the current state, so
  the supported forms are unchanged: omit `state`, or pass `getPureState()`.

- 8dfbe1b: Reading a computed getter after a write is an order of magnitude faster again.

  A getter reads state through a frozen snapshot of the subtree it touches, cached
  by object identity, and a write makes the containers along the change new
  objects. Carrying the snapshot forward along the patch paths is proportional to
  the change; rebuilding it is proportional to whatever the getter can reach.

  The maintenance existed, in the `setState` fast path — which a store with
  reactive path nodes cannot take, and reading a getter is what creates those
  nodes. So it stopped running the moment the feature it serves was used, and
  nothing reported it: every value stayed correct and the cost went up. It now
  runs at the commit point, which every write passes.

  On a store of a thousand items, a getter summing them goes from 3,837 reads a
  second to 41,972; one reading a single field of four thousand items goes from
  1,043 to 34,413, and no longer gets slower as the array grows.

- ccea3c9: A commit's inverse patches are now rebuilt in one more case: where a later patch
  writes inside what an earlier one replaced, not only where it replaces what an
  earlier one wrote inside.

  Both directions make the pair unsafe to apply in the order it comes — undoing a
  container before the write inside it re-applies into something already whole,
  which for an `add` is one element too many. Only the first direction was
  detected, so a transition of the second shape produced an inverse that could not
  be applied: an undo that fails, or a sync rebase that stops rolling back.

  Found by running the property suites at fifty times their usual seed count.

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

## 3.2.1

### Patch Changes

- 2aa64be: Fix an O(total state) cost in the object-payload `setState()` path. Copying the store's current
  root state ran every value through the deep replacement sanitizer, so `set({ ... })` re-cloned
  untouched fields on every commit. Replacing a single scalar in a store holding a 10,000-item array
  drops from ~1,591 ms to ~2 ms per 400 operations. Incoming payloads are still deep-sanitized, so
  the aliasing and unsafe-key guarantees are unchanged. Both the fixed path and the payload path are
  now covered by benchmark regression thresholds. The `coaction/local` gzip budget moves up ~240 B to cover the new helper.

## 3.2.0

### Minor Changes

- 0a394fd: Add an explicit, contract-safe local fallback for client stores. Passing `worker: undefined` or `clientTransport: undefined` now keeps `getState()` actions promise-based, defers their effects until the promise job runs, and enforces the shared JSON contract for state, arguments, and results. Client option overloads now preserve that async type through object spreads, while `getInitialState()` accurately retains the original synchronous initialization shape.

  Migration: callers that previously passed `worker: undefined` or `clientTransport: undefined` must now `await` actions. Initial state, action arguments and results, and low-level state mutations on that path must remain JSON-compatible.

## 3.1.0

### Minor Changes

- Added `onStoreCommit()`, `onStoreCommitPrepare()`, and
  `replayStorePatches()` to `coaction/adapter`. External runtimes can now observe
  authoritative patch pairs and replay navigation through Coaction's validation,
  middleware, adapter, subscription, and transport pipeline.
- Published commit events for direct root replacements and added
  middleware-scoped patch replay so integrations can preserve their own
  `setState` boundary.

### Patch Changes

- Shared store-readiness metadata across the root, local, shared, and adapter
  entry bundles so mixed imports cannot miss ready callbacks.
- Preserved circular, shared, and other non-tree local object graphs when
  publishing replacement commits.
- Skipped commit-prepare work for scalar transitions while retaining exact
  replacement preparation for object graphs.

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

  Preserve deep public-state mutation guards while evaluating cached derived
  values against an incrementally updated frozen snapshot. This removes the
  per-field readonly-proxy cost from invalidated computed reads and restores the
  maintained update-plus-read performance gate.

  Commit native shared-store updates through a private prepared-patch path so
  already checked patches and final state are not repeatedly cloned, sanitized,
  and scanned. Public `apply()`, custom updaters, patch hooks, middleware, and
  adapter overrides retain their full validation boundaries.

  Redact unexpected remote action failures by default instead of forwarding an
  arbitrary thrown `Error.message` across the transport boundary. Authorities
  can explicitly publish application-safe domain messages through
  `transportPolicy.mapError`.

  Reject in-flight action responses from a superseded authority with
  `ActionAuthorityChangedError` instead of attempting a full sync back to the
  old epoch. The error exposes a stable code and marks the action outcome as
  unknown so callers do not blindly retry non-idempotent work. The public error
  and stale-response guard add about 0.3 KiB gzip to the shared entry.

## 2.1.0

### Minor Changes

- Hardened fixed-schema runtime invariants by locking public state modules, rejecting destroyed-store operations, and keeping replacement-style known root key omission explicit.
- Added shared root replacement and mutable adapter helper flows so history, persistence, Yjs, and official mutable adapters apply root add/remove/replace semantics consistently.

### Patch Changes

- Rejected unsafe patch-hook output before applying patches instead of silently dropping unsafe paths.
- Prevented patch application from public state facades from resurrecting omitted known root keys.
- Documented the supported integration helper surface and external mutable-runtime unknown-key policy.

## 2.0.0

### Major Changes

- Rebuilt computed state on top of `alien-signals`, including cached getters, dependency-aware invalidation, exported signal primitives, and reactive tracking utilities for framework bindings.
- Added the formal external store adapter API through `defineExternalStoreAdapter()` and the compatibility `createBinder()` alias, with lifecycle-ready hooks and helper utilities for exact external-store replacement.
- Tightened shared-store semantics for 2.0 by requiring JSON-serializable shared state, rejecting symbol/unsafe execute paths, validating `fullSync` payloads, and preventing client mirrors from mutating through `apply()` or adapter bypasses.
- Expanded state-shape support for local stores, including symbol-keyed slices, symbol-keyed actions, circular references, sparse arrays, non-enumerable raw descriptors, and object single-store creators.

### Patch Changes

- Hardened patch handling by sanitizing custom updater patches, patch-hook output, low-level `apply()` state, client `fullSync` state, and nested enumerable merges.
- Preserved cycles, sparse arrays, and hidden descriptors while copying, initializing, replacing, and reading state.
- Improved async client behavior by awaiting async method return types, validating sequence catch-up/full-sync fallbacks, and guarding SharedWorker client detection.
- Ensured middleware can observe external store updates consistently while keeping adapter markers hidden unless they must remain copyable for keyed adapters.

## 1.5.0

### Minor Changes

- Hardened state update semantics by filtering unsafe keys during initialization and fast-path updates, preserving symbol-keyed state descriptors, treating `setState(null)` as a no-op, removing duplicate patch notifications, and preserving slice sibling state in the local object fast path.
- Tightened shared-client synchronization by rejecting stale `fullSync` fallbacks before they can roll back mirrored state.
- Tightened `create()` mode validation and documented the maintained runtime, adapter, and middleware support boundaries for the 1.5 line.

## 1.4.1

### Patch Changes

- Clarified the guidance for ambiguous `sliceMode: 'auto'` object-of-functions inputs with explicit `single` and `slices` examples in warnings and docs.
- Documented and tested that methods destructured from `store.getState()` keep their `this` binding to the latest store state.
- Added a generated core API reference for `create()`, store types, middleware contracts, and `createBinder()`.

## 1.4.0

- Added `executeSyncTimeoutMs` to configure how long async clients wait for sequence catch-up before falling back to `fullSync`.
- Preserved 1.x middleware and worker typing compatibility by keeping `patch`, `trace`, and deprecated `workerType` options public while introducing `MiddlewareStore` as the preferred middleware-facing type.
- Kept `sliceMode: 'auto'` backward-compatible for object-of-functions inputs, but now warns in development because that shape is ambiguous and should use an explicit `sliceMode`.

## 1.3.0

- Recovered client synchronization after sequence resets and incremental apply failures.
- Blocked prototype pollution in `mergeObject`.

## 1.2.0

- Hardened full-sync fallback handling by validating payload shapes, rejecting stale sequences, preventing sequence rollback, and guarding update-listener failures.
- Improved state initialization and slice merging by validating factory return values, ignoring unknown or inherited keys, and supporting legacy execute transport responses.
- Awaited async worker execute results, enforced shared store name uniqueness, and emitted patches after patch-hook transformation.

## 1.1.0

- Added a full-sync timeout fallback for execute sequences.

## 1.0.1

- First 1.x version-alignment release with no package-specific source changes.

## 0.2.0

- Added explicit `sliceMode` and fail-fast validation for third-party slices bindings.
- Hardened store lifecycle and middleware validation, including destroy safety, init-failure cleanup, and unknown-safe transport error handling.
- Improved async, client, and worker transport handling while migrating the workspace build from Preconstruct to `tsup`.

## 0.1.5

- Refined `act()` and raw-state internals ahead of the first adapter expansion.

## 0.1.4

- Version-alignment release with no package-specific source changes.

## 0.1.3

- Version-alignment release with no package-specific source changes.

## 0.1.2

- Version-alignment release with no package-specific source changes.

## 0.1.0

- Initial release of the Coaction core store API.
- Added computed state, patch support, slices, async actions, and client/worker/shared-worker synchronization.
- Added middleware support and early examples for framework adapters.

## Unreleased

- Add lazy patch-driven deep reactive path tracking for immutable stores.
- Remove full signal-slot refresh scanning from immutable commit paths.
