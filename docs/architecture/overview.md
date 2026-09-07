# Architecture Overview

This directory documents Coaction from the maintainer's point of view.

The public API is intentionally small, but the runtime has several distinct layers:

1. Shared-mode selection in `packages/core/src/create.ts`, local-only creation
   in `packages/core/src/createLocal.ts`, and common lifecycle construction in
   `packages/core/src/storeFactory.ts`
2. State materialization and method binding in `packages/core/src/getInitialState.ts` and `packages/core/src/getRawState.ts`
3. Local and shared mutation flow in `packages/core/src/handleState.ts`
4. The authority and its client mirrors in `packages/core/src/asyncClientStore.ts` and `packages/core/src/handleMainTransport.ts`
5. Adapter and middleware integration points in `packages/core/src/binder.ts` and the package-level middleware implementations

## Three things that are not each other

The word "sync" gets used for all of them, and they solve different problems:

|                            | What it is                                                                                                                       | Where it lives                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Reactive tracking**      | Which components re-render when a field changes. `observer`, selectors, computed getters.                                        | `packages/core/src/reactivePath.ts`, `@coaction/react` |
| **Shared authority**       | One store owns the state; other JavaScript contexts hold mirrors of it and call actions on it over a transport. A Worker, a tab. | `coaction/shared`                                      |
| **Remote synchronization** | A durable outbox, a rebase against a server, and offline recovery.                                                               | `@coaction/sync`                                       |

They compose, and none implies another. A local store can use `@coaction/sync`
without ever creating a Worker. A shared store's mirrors are not a replication
protocol — the authority is a single process, and a mirror is a view of it, not
a replica that can diverge and be merged.

## Package Layers

- `packages/core`
  - `coaction`: transport-free local creation
  - `coaction/shared`: the JSON protocol, authority and client mirrors, and reconnect recovery
  - `coaction/adapter`: external runtime integration helpers
- `packages/coaction-*` framework bindings
  - Wrap a core store for framework-specific reactivity and lifecycle behavior
- `packages/coaction-*` state adapters
  - Bridge an external state system into Coaction through `defineExternalStoreAdapter()` or the compatibility alias `createBinder()`
- `packages/coaction-*` middlewares
  - Extend a core store by decorating `setState()`, `apply()`, `destroy()`, or by attaching extra store APIs

## Runtime Terminology

- Local store
  - A store with no transport. The same runtime owns execution and state.
- Main store
  - The authority for a shared store. Mutations execute here and updates fan out through a transport.
- Client store
  - A mirror of a main store. It proxies method execution to the main store and applies updates pushed over the transport.
- Slice store
  - A store created from an object of slice factories rather than a single state factory.
- Binder-backed adapter
  - An external store integration built through `defineExternalStoreAdapter()` or `createBinder()`. These are whole-store adapters, not slice-level adapters.

## Reading Order

- Start with [core-runtime.md](./core-runtime.md) for creation flow and patch semantics.
- Then read [threading-model.md](./threading-model.md) for the JSON transport and local/main/client authority rules.
- Read [support-matrix.md](./support-matrix.md) for the officially maintained feature-combination boundaries.
- Read [api-evolution.md](./api-evolution.md) for the maintenance boundary of `create()`.
- Read [adapter-contract.md](./adapter-contract.md) before adding or changing an official adapter.
- Read [../roadmap/devtools.md](../roadmap/devtools.md) before promising DevTools behavior beyond logger, snapshots, patches, and middleware hooks.

## Design Constraints

- `coaction` creates local stores and rejects transport options. The shared
  authority and client runtimes are available through `coaction/shared`.
- Shared mode treats the main store as the single execution authority.
- Client stores are mirrors, not peers. They may read local mirrored state, but they do not own mutation authority.
- Binder-backed adapters and Coaction slices solve different composition problems and should not be mixed.
