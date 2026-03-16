# @coaction/persist

## 1.5.0

### Minor Changes

- Aligned the peer dependency with `coaction@^1.5.0`.

## 1.4.1

### Patch Changes

- Aligned the peer dependency with `coaction@^1.4.1`.

## 1.4.0

- Aligned the peer dependency with `coaction@^1.4.0`.

## 1.3.0

- Serialized async storage writes and preserved queued writes during destroy.
- Hardened rehydration by avoiding pre-hydration storage clobber, merging pure snapshots correctly, writing back canonical versions, and guarding hydration lifecycle races.
- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Handled async storage write rejections, missing `queueMicrotask`, and rehydrate-error completion correctly.
- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- First stable release of the persistence middleware.
