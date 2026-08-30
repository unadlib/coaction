# @coaction/persist

## 3.2.1

## 3.2.0

## 3.1.0

### Patch Changes

- Aligned the persistence middleware peer dependency with Coaction 3.1's
  authoritative patch pipeline.
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

- Skipped hydration when a persisted version mismatches and no migration is provided, preventing stale schemas from being silently promoted.
- Applied shared-main hydration through the root replacement patch flow so exact custom merges can remove known root keys safely.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Updated the persistence middleware for Coaction 2.0's stricter middleware, shared-store, and patch-sanitization contracts.
- Reworked hydration application so persisted state is merged and applied exactly against the current Coaction state.

### Patch Changes

- Sanitized hydrated and partialized state before merging or writing.
- Isolated `onRehydrateStorage` callback errors from the hydration pipeline.
- Queued `clearStorage()` behind pending async writes to preserve write order.
- Synced shared-store hydration through Coaction and rejected persistence on client mirror stores.
- Suppressed initial hydration from history undo/redo tracking.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Aligned the peer dependency with `coaction@^1.5.0`.

## 1.4.1

### Patch Changes

- Aligned the peer dependency with `coaction@^1.4.1`.

## 1.4.0

- Aligned the peer dependency with `coaction@^1.4.0`.

## 1.3.0

- Serialized async storage writes and preserved queued writes during destroy.
- Hardened rehydration by avoiding pre-hydration storage clobber, merging pure snapshots correctly, writing back canonical versions, and guarding hydration lifecycle races.
- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Handled async storage write rejections, missing `queueMicrotask`, and rehydrate-error completion correctly.
- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- First stable release of the persistence middleware.
