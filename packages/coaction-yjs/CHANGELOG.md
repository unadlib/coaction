# @coaction/yjs

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

- Aligned the Yjs binding peer dependency with Coaction 3.1's authoritative
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

- Applied remote root replacements and delete operations through the shared root replacement patch flow so removed known root keys stay removed.
- Treated Coaction schema errors as recoverable remote-shape failures and restored the authoritative Yjs state instead of diverging raw and public state.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Updated the Yjs binding for Coaction 2.0's stricter middleware, shared-store, and patch-sanitization contracts.
- Reworked local-to-Yjs and remote-to-Coaction synchronization to support exact root replacements, shared root replacement sync, and patch-hook transforms.

### Patch Changes

- Bound middleware after store initialization and suppressed initial Yjs hydration from history undo/redo tracking.
- Rejected symbol-keyed, symbol-valued, non-plain, and otherwise unstable remote state values before applying them to Coaction.
- Ignored unsafe remote keys, recovered missing root state maps, and rolled back invalid local sync attempts.
- Honored remote container path types, normalized string array path segments, and preserved primitive fallback clone values.
- Added structured-clone fallback handling for environments or values where cloning fails.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Refactored the Yjs binding internals into focused sync, value-conversion, and remote-operation modules without changing the public API.
- Aligned the peer dependency with `coaction@^1.5.0`.

## 1.4.1

### Patch Changes

- Aligned the peer dependency with `coaction@^1.4.1`.

## 1.4.0

- Aligned the peer dependency with `coaction@^1.4.0`.

## 1.3.0

- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Added a fallback for environments where `queueMicrotask` is unavailable.
- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Hardened multi-peer synchronization behavior.
- Expanded collaboration documentation and sync-semantic test coverage.
- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- First stable release of the Yjs binding.
