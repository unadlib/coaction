# @coaction/redux

## 4.0.0

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

- Aligned the Redux adapter peer dependency with Coaction 3.1's authoritative
  patch commit and replay pipeline.
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

- Aligned the Redux adapter peer dependency with Coaction 2.1's fixed-schema runtime guarantees.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Updated the Redux adapter for Coaction 2.0's formal external store adapter contract.
- Reworked replacement dispatch handling so Redux state and Coaction state stay synchronized during Coaction-initiated and Redux-initiated replacements.

### Patch Changes

- Notified Coaction subscribers after replacement dispatches initiated by Coaction.
- Preserved circular replace payloads, symbol keys, array properties, and non-record snapshot values where Redux state allows them.
- Sanitized unsafe replacement keys and avoided leaking binder symbol markers into Redux state.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Notified Coaction subscribers after external Redux writes and added official binder-adapter contract coverage for local whole-store usage.
- Aligned the peer dependency with `coaction@^1.5.0`.

## 1.4.1

### Patch Changes

- Aligned the peer dependency with `coaction@^1.4.1`.

## 1.4.0

- Aligned the peer dependency with `coaction@^1.4.0`.

## 1.3.0

- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Unsubscribed the Redux listener when the Coaction store is destroyed.
- Sanitized replace-action payloads by stripping inherited properties only.
- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- First stable release of the Redux adapter.
