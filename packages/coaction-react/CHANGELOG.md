# @coaction/react

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
