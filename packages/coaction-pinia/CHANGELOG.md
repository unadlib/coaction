# @coaction/pinia

## 2.0.0

### Major Changes

- Release Coaction 2.0 with alien-signals-backed computed state, React selector
  reactivity, and a formal external store adapter API.

### Patch Changes

- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Made Pinia adapter cleanup idempotent on `store.destroy()` and added official
  binder-adapter contract coverage for local and shared whole-store usage.
- Aligned the peer dependency with `coaction@^1.5.0`.

## 1.4.1

### Patch Changes

- Aligned the peer dependency with `coaction@^1.4.1`.

## 1.4.0

- Aligned the peer dependency with `coaction@^1.4.0`.

## 1.3.0

- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Ignored inherited and non-function getters when binding Pinia getters.
- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- Promoted the Pinia adapter to the 1.x line.
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

- Initial release of the Pinia adapter.
- Shipped follow-up fixes for subscriptions, store updates, async actions, and getter handling.
