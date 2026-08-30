# @coaction/zustand

## 3.2.1

## 3.2.0

## 3.1.0

### Patch Changes

- Added real-browser SharedWorker and Web Worker coverage for the Zustand
  adapter, validating cross-page source-store synchronization, async client
  actions, and safe remote error redaction.
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

- Aligned the Zustand adapter peer dependency with Coaction 2.1's fixed-schema runtime and patch-safety guarantees.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Updated the Zustand adapter for Coaction 2.0's formal external store adapter contract and signal-backed notification model.
- Reworked shared replacement and external-write synchronization so Zustand source stores, Coaction raw state, and public state remain aligned.

### Patch Changes

- Synced shared replace updates back to the source Zustand store and published shared main external writes through Coaction.
- Honored Zustand initializer `replace` semantics and supported initializer `set`/`get` fallbacks before the Coaction store is bound.
- Restored shared client state after rejected external writes.
- Refreshed Coaction signals after external Zustand writes and made adapter-installed destroy wrappers idempotent.
- Declared the required Zustand peer dependency for runtime integrations.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Released adapter-installed Zustand subscriptions on `store.destroy()` and added official binder-adapter contract coverage for local and shared whole-store usage.
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

- Promoted the Zustand adapter to the 1.x line.
- Added slice-store support and rejected slices mode in the adapter where it is unsafe.
- Fixed state update and store synchronization issues.

## 0.1.5

- Initial release of the Zustand adapter.
- Fixed the initial published type definitions.
