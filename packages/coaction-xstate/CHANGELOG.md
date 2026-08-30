# @coaction/xstate

## 3.2.1

## 3.2.0

## 3.1.0

### Patch Changes

- Aligned the XState adapter peer dependency with Coaction 3.1's authoritative
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

- Aligned the XState adapter peer dependency with Coaction 2.1's fixed-schema runtime guarantees.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Updated the XState adapter for Coaction 2.0's formal external store adapter contract.
- Made XState actor context the authoritative mutation path by blocking direct Coaction mutations and middleware bypasses.

### Patch Changes

- Subscribed to the actor after Coaction store initialization.
- Ignored client actor writes and rejected unsupported client-side mutations.
- Sanitized unsafe initial context keys and exact snapshot replacements.
- Made adapter destroy handling idempotent.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Added official binder-adapter contract and type coverage for local whole-store XState integrations.
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

- First stable release of the XState adapter.
