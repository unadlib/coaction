# coaction

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
