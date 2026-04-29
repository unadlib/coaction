# Adapter Contract

This document covers official adapter expectations.

Coaction currently has two adapter families:

- binder-backed state adapters built with `defineExternalStoreAdapter()` or its
  compatibility alias `createBinder()`
- non-binder integrations such as Yjs or framework wrappers

The most rigid contract applies to binder-backed state adapters.

## Binder Adapter Scope

`defineExternalStoreAdapter()` exists to bridge an external whole-store
implementation into Coaction. Existing integrations may still call
`createBinder()`, which is kept as a compatibility alias.

Examples:

- Zustand
- Redux
- Jotai
- Pinia
- MobX
- Valtio
- XState

Non-goals:

- slice-level binding
- mixing a binder-backed adapter into Coaction slices mode
- defining transport authority rules different from the core authority model

## Required Runtime Behavior

An official binder-backed adapter must satisfy all of the following:

- `subscribe`
  - Coaction listeners are notified when the external store changes
- `update`
  - Coaction method execution updates the external store and keeps Coaction's
    view in sync
- `external write`
  - direct writes in the external store are observed and reflected back into the
    Coaction store according to the adapter's contract
  - immutable adapters that assign `internal.rootState` directly must call
    `internal.notifyStateChange()` so signal-backed selectors and store
    subscribers see the change
- `destroy`
  - adapter-installed subscriptions or observers are released when
    `store.destroy()` runs
- type expectations
  - the adapter returns a whole-store shape compatible with Coaction's runtime
    and public TypeScript surface

## Adapter Responsibilities

`defineExternalStoreAdapter()` splits adapter work into two hooks.

### `handleState`

The adapter must:

- return a copy of the incoming external store state
- optionally expose a nested key if the external API wraps its real state
- return a `bind()` function that converts external state into Coaction raw state

### `handleStore`

The adapter must:

- attach subscriptions or observers so external writes reach Coaction
- call `internal.notifyStateChange()` after external immutable writes that
  update `internal.rootState` without going through `store.setState()` or
  `store.apply()`
- preserve Coaction store lifecycle semantics
- clean up external resources from an overridden `destroy()` when needed
- avoid violating client/main authority rules

## Type and Shape Requirements

Official adapter outputs must preserve the Coaction store contract:

- `setState`
- `getState`
- `subscribe`
- `destroy`
- `apply`
- `getPureState`

If an adapter returns a replacement store object or patches runtime methods, the
result still has to be store-like and compatible with middleware chaining.

## Supported Combinations

Officially supported:

- binder-backed adapter as a whole store in local mode
- binder-backed adapter as a whole store in main/shared mode when the adapter
  itself supports that runtime
- binder-backed adapter as a whole store in client/shared mode when the adapter
  explicitly supports Coaction's mirror authority model

Officially unsupported:

- binder-backed adapter inside Coaction slices mode
- adapter behavior that allows client mode to become an independent write
  authority
- adapter-specific transport semantics that bypass the core sequence model

## Client-Bound External Writes

Shared client support is narrower than local whole-store support.

What is part of the maintained contract in shared client mode:

- calling Coaction store methods from the client mirror
- receiving transport-driven updates from the authority store
- converging through the core sequence model

What is not automatically part of the contract:

- mutating the underlying third-party store instance attached to the client
  mirror

That client-bound external-write behavior is adapter-specific unless an adapter
explicitly documents and enforces it.

Current status:

- `@coaction/zustand`
  direct writes to the client-side Zustand store are explicitly rejected
- `@coaction/mobx`
  direct writes to the client-side MobX instance are not a maintained contract
- `@coaction/pinia`
  direct writes to the client-side Pinia store instance are not a maintained
  contract

Treat the last two as integration-defined behavior. If strict client-side
authority enforcement is required, the adapter must add an explicit runtime
guard before this repository can claim that as supported behavior.

See [support-matrix.md](./support-matrix.md) for the package-by-package support
status of official adapters.

## Contract Tests

Official binder-backed adapters should share one contract suite.

That suite should verify at least:

- subscribe contract
- update through Coaction methods
- external write propagation
- destroy cleanup
- supported and unsupported mode coverage
- stable type expectations where TypeScript coverage exists

Package-specific tests should remain for behavior that is unique to the
underlying state system, but baseline adapter behavior should not be repeated by
copying the same test file across packages.
