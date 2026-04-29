# @coaction/react

## 2.0.0

### Major Changes

- Release Coaction 2.0 with alien-signals-backed computed state, React selector
  reactivity, and a formal external store adapter API.

### Patch Changes

- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Reworked `autoSelector` to return cached selector maps through
  `useStore.auto()` and `useStore({ autoSelector: true })` instead of hiding
  hook calls inside property getters.
- Stopped auto-selector expansion on recursive object graphs and documented that
  dynamically added keys should use explicit selectors.
- Fixed full-state React subscriptions for mutable adapters so MobX, Pinia, and
  Valtio-backed stores rerender correctly for full-state readers and selectors.
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
