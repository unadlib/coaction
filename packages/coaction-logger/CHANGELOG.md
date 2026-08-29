# @coaction/logger

## 3.2.0

## 3.1.0

### Patch Changes

- Aligned the logger middleware peer dependency with Coaction 3.1's commit and
  replay lifecycle.
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

- Aligned the logger middleware peer dependency with Coaction 2.1's hardened patch pipeline and replacement semantics.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Updated the logger middleware for Coaction 2.0's middleware store contract.
- Kept action, patch, and trace logging compatible with the stricter 2.0 state and patch sanitization rules.

### Patch Changes

- Made serialized logging tolerate circular references, BigInt values, and other unserializable values.
- Fixed trace timing when a trace starts at timestamp `0`.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Ensured logger traces are always closed when traced actions throw or reject.
- Aligned the peer dependency with `coaction@^1.5.0`.

## 1.4.1

### Patch Changes

- Aligned the peer dependency with `coaction@^1.4.1`.

## 1.4.0

- Aligned middleware typings with `coaction`'s `MiddlewareStore` alias without changing runtime logging behavior.
- Aligned the peer dependency with `coaction@^1.4.0`.

## 1.3.0

- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Ensured action log groups are always closed when `setState` throws.
- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Moved the package source to `packages/coaction-logger` without changing the published package name.
- Verified both default and named entrypoint exports.
- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- Promoted the logger middleware to the 1.x line.
- Fixed action grouping to respect injected logger implementations.

## 0.1.5

- Version-alignment release with no package-specific source changes.

## 0.1.4

- Version-alignment release with no package-specific source changes.

## 0.1.3

- Version-alignment release with no package-specific source changes.

## 0.1.2

- Version-alignment release with no package-specific source changes.

## 0.1.0

- Initial release of the logger middleware.
- Added support for verbose logging options.
