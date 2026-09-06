# @coaction/valtio

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

### Patch Changes

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

## 3.1.0

### Patch Changes

- Added real-browser SharedWorker and Web Worker coverage for the Valtio binding,
  validating cross-page proxy synchronization, async client actions, and safe
  remote error redaction.
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

### Minor Changes

- Applied mutable adapter patches from Coaction raw snapshots by default, preventing omitted known root keys from being resurrected by later patches.
- Restored Valtio raw accessor descriptors when known root keys are removed and later re-added, keeping Valtio proxy state, Coaction raw state, and public state linked.

### Patch Changes

- Documented that unknown root properties written directly to the Valtio proxy are not promoted into Coaction state and are not guaranteed to be pruned.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Updated the Valtio adapter for Coaction 2.0's formal external store adapter API and signal-backed notification model.
- Reworked mutable replacement and shared-store synchronization so Valtio proxy state, Coaction raw state, and public state are replaced exactly.

### Patch Changes

- Preserved sparse arrays, circular references, and non-record snapshot values during snapshots and replacements.
- Sanitized unsafe initial and replacement keys while preserving valid symbol and array metadata.
- Restored shared client state after rejected external writes and published shared main external writes through Coaction.
- Made adapter-installed destroy wrappers idempotent and refreshed Coaction signals after external mutable updates.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Released adapter-installed Valtio subscriptions on `store.destroy()` and added official binder-adapter contract coverage for local whole-store usage.
- Aligned the peer dependency with `coaction@^1.5.0`.

## 1.4.1

### Patch Changes

- Aligned the peer dependency with `coaction@^1.4.1`.

## 1.4.0

- Aligned the peer dependency with `coaction@^1.4.0`.

## 1.3.0

- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- First stable release of the Valtio adapter.
