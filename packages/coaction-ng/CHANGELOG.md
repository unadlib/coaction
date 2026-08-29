# @coaction/ng

## 3.2.0

### Minor Changes

- 7d77649: Fix client-store type inference in framework creators. Options carrying
  `worker` or `clientTransport`, including through object spreads, now preserve
  the async client action types. Calls without client transport options remain
  synchronous, and `getInitialState()` retains the original synchronous
  initialization shape.

## 3.1.0

### Patch Changes

- Added real-browser SharedWorker and Web Worker coverage for the Angular
  binding, validating cross-page signal synchronization, async client actions,
  and safe remote error redaction.
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

- Aligned the Angular binding peer dependency with Coaction 2.1's fixed-schema runtime guarantees.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Updated the Angular binding for Coaction 2.0's signal-backed core.
- Kept the `state` and `select()` signal APIs stable while aligning their invalidation behavior with Coaction's 2.0 versioned state updates.

### Patch Changes

- Notified consumers of stable object signals when the underlying Coaction state changes.
- Updated creator typings for object single-store creators and symbol-keyed slices inherited from the core.
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

- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- First stable release of the Angular adapter.
