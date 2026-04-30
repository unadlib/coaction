# Architecture Overview

This directory documents Coaction from the maintainer's point of view.

The public API is intentionally small, but the runtime has several distinct
layers:

1. Core store creation and state lifecycle in `packages/core/src/create.ts`
2. State materialization and method binding in `packages/core/src/getInitialState.ts`
   and `packages/core/src/getRawState.ts`
3. Local and shared mutation flow in `packages/core/src/handleState.ts`
4. Client/main synchronization in `packages/core/src/asyncClientStore.ts` and
   `packages/core/src/handleMainTransport.ts`
5. Adapter and middleware integration points in `packages/core/src/binder.ts`
   and the package-level middleware implementations

## Package Layers

- `packages/core`
  - Runtime authority model, state materialization, patch generation, transport
    integration, middleware hooks, adapter hooks
- `packages/coaction-*` framework bindings
  - Wrap a core store for framework-specific reactivity and lifecycle behavior
- `packages/coaction-*` state adapters
  - Bridge an external state system into Coaction through
    `defineExternalStoreAdapter()` or the compatibility alias `createBinder()`
- `packages/coaction-*` middlewares
  - Extend a core store by decorating `setState()`, `apply()`, `destroy()`, or
    by attaching extra store APIs

## Runtime Terminology

- Local store
  - A store with no transport. The same runtime owns execution and state.
- Main store
  - The authority for a shared store. Mutations execute here and updates fan out
    through a transport.
- Client store
  - A mirror of a main store. It proxies method execution to the main store and
    applies updates pushed over the transport.
- Slice store
  - A store created from an object of slice factories rather than a single
    state factory.
- Binder-backed adapter
  - An external store integration built through `defineExternalStoreAdapter()`
    or `createBinder()`. These are whole-store adapters, not slice-level
    adapters.

## Reading Order

- Start with [core-runtime.md](./core-runtime.md) for creation flow and patch
  semantics.
- Then read [threading-model.md](./threading-model.md) for local/main/client
  authority rules.
- Read [support-matrix.md](./support-matrix.md) for the officially maintained
  feature-combination boundaries.
- Read [api-evolution.md](./api-evolution.md) for the maintenance boundary of
  `create()`.
- Read [adapter-contract.md](./adapter-contract.md) before adding or changing an
  official adapter.
- Read [../roadmap/devtools.md](../roadmap/devtools.md) before promising
  DevTools behavior beyond logger, snapshots, patches, and middleware hooks.

## Design Constraints

- `create()` supports multiple modes today for backward compatibility, but new
  semantics should prefer explicit helpers or variants over additional overload
  ambiguity.
- Shared mode treats the main store as the single execution authority.
- Client stores are mirrors, not peers. They may read local mirrored state, but
  they do not own mutation authority.
- Binder-backed adapters and Coaction slices solve different composition
  problems and should not be mixed.
