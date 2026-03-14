# coaction

## 1.4.0

- Added `executeSyncTimeoutMs` to configure how long async clients wait for sequence catch-up before falling back to `fullSync`.
- Preserved 1.x middleware and worker typing compatibility by keeping `patch`, `trace`, and deprecated `workerType` options public while introducing `MiddlewareStore` as the preferred middleware-facing type.
- Kept `sliceMode: 'auto'` backward-compatible for object-of-functions inputs, but now warns in development because that shape is ambiguous and should use an explicit `sliceMode`.

## 1.3.0

- Recovered client synchronization after sequence resets and incremental apply failures.
- Blocked prototype pollution in `mergeObject`.

## 1.2.0

- Hardened full-sync fallback handling by validating payload shapes, rejecting stale sequences, preventing sequence rollback, and guarding update-listener failures.
- Improved state initialization and slice merging by validating factory return values, ignoring unknown or inherited keys, and supporting legacy execute transport responses.
- Awaited async worker execute results, enforced shared store name uniqueness, and emitted patches after patch-hook transformation.

## 1.1.0

- Added a full-sync timeout fallback for execute sequences.

## 1.0.1

- First 1.x version-alignment release with no package-specific source changes.

## 0.2.0

- Added explicit `sliceMode` and fail-fast validation for third-party slices bindings.
- Hardened store lifecycle and middleware validation, including destroy safety, init-failure cleanup, and unknown-safe transport error handling.
- Improved async, client, and worker transport handling while migrating the workspace build from Preconstruct to `tsup`.

## 0.1.5

- Refined `act()` and raw-state internals ahead of the first adapter expansion.

## 0.1.4

- Version-alignment release with no package-specific source changes.

## 0.1.3

- Version-alignment release with no package-specific source changes.

## 0.1.2

- Version-alignment release with no package-specific source changes.

## 0.1.0

- Initial release of the Coaction core store API.
- Added computed state, patch support, slices, async actions, and client/worker/shared-worker synchronization.
- Added middleware support and early examples for framework adapters.
