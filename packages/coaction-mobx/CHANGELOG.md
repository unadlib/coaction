# @coaction/mobx

## 3.2.0

## 3.1.0

### Patch Changes

- Added real-browser SharedWorker and Web Worker coverage for the MobX binding,
  validating cross-page observable synchronization, async client actions, and
  safe remote error redaction.
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
- Restored MobX raw accessor descriptors when known root keys are removed and later re-added, keeping MobX observable state, Coaction raw state, and public state linked.

### Patch Changes

- Documented that unknown root properties written directly to the MobX instance are not promoted into Coaction state and are not guaranteed to be pruned.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Updated the MobX adapter for Coaction 2.0's formal external store adapter API and signal-backed notification model.
- Reworked mutable replacement and shared-store synchronization so MobX observable state, Coaction raw state, and public state are replaced exactly.

### Patch Changes

- Preserved sparse arrays, circular references, non-record snapshot values, and symbol-keyed observable state during snapshots and replacements.
- Sanitized unsafe initial and replacement keys without rewriting MobX internal observable symbols.
- Restored shared client state after rejected external writes and published shared main external writes through Coaction.
- Made adapter-installed destroy wrappers idempotent and refreshed Coaction signals after external mutable updates.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Released adapter-created MobX subscriptions from `store.destroy()` and added official binder-adapter contract coverage for local and shared whole-store usage.
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

- Promoted the MobX adapter to the 1.x line.
- Rejected slices mode in the adapter to match the core safety checks.

## 0.1.5

- Version-alignment release with no package-specific source changes.

## 0.1.4

- Version-alignment release with no package-specific source changes.

## 0.1.3

- Version-alignment release with no package-specific source changes.

## 0.1.2

- Version-alignment release with no package-specific source changes.

## 0.1.0

- Initial release of the MobX adapter.
- Added MobX patch integration and followed up with getter, option, and type fixes.
