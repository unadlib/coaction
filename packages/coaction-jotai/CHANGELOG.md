# @coaction/jotai

## 3.2.1

## 3.2.0

## 3.1.0

### Patch Changes

- Added real-browser SharedWorker and Web Worker coverage for the Jotai binding,
  validating cross-page atom synchronization, async client actions, and safe
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

### Patch Changes

- Aligned the peer dependency with Coaction 2.1's fixed-schema runtime and patch-safety guarantees.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Updated the Jotai adapter for Coaction 2.0's formal external store adapter contract.
- Hardened atom synchronization across local and shared stores so Coaction and Jotai subscribers observe the same state transitions.

### Patch Changes

- Notified Coaction subscribers after atom syncs initiated from Coaction.
- Preserved safe property keys during atom-state copying while continuing to filter unsafe keys.
- Guarded shared client atom writes and restored client mirrors after rejected external writes.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Notified Coaction subscribers after external Jotai atom writes so framework bindings and middleware stay in sync with adapter-backed updates.
- Added official binder-adapter contract coverage for local whole-store Jotai integrations.
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

- First stable release of the Jotai adapter.
