**coaction**

---

# Core API Reference

This reference is generated from the documentation-only catalog in
`packages/core/api-docs.ts`. The catalog combines symbols from the root entry
and the public subpaths; it does not imply that every listed symbol is exported
from `coaction`.

## Import Map

| Import path        | Intended use                                                                        |
| ------------------ | ----------------------------------------------------------------------------------- |
| `coaction`         | Compatibility entry that selects local or shared behavior from runtime options.     |
| `coaction`         | Transport-free local stores and local signal/lifecycle helpers.                     |
| `coaction/shared`  | Shared authority/client stores, the JSON protocol, and reconnect behavior.          |
| `coaction/adapter` | External-store adapter contracts, snapshots, patch helpers, and reactive utilities. |

## Primary Entry Points

- [create](api-docs/variables/create.md): exported by `coaction` and
  `coaction/shared`; creates local stores, shared main stores, and shared
  clients.
- [create from coaction](api-docs/variables/createLocal.md): documentation name
  for the transport-free implementation exported as `create` by
  `coaction`. `createLocal` is not a root-package export.
- [Store](api-docs/interfaces/Store.md) and [MiddlewareStore](api-docs/interfaces/MiddlewareStore.md): runtime store contracts.
- [StoreOptions](api-docs/type-aliases/StoreOptions.md) and [ClientStoreOptions](api-docs/type-aliases/ClientStoreOptions.md): creation options for main/local and client stores.
- [Slice](api-docs/type-aliases/Slice.md) and [Slices](api-docs/type-aliases/Slices.md): state-factory signatures.
- [Middleware](api-docs/type-aliases/Middleware.md): store enhancement contract.
- [defineExternalStoreAdapter](api-docs/functions/defineExternalStoreAdapter.md):
  exported by `coaction/adapter`; third-party whole-store adapter helper.
  `createBinder` remains available there as the compatibility name.
- [createReactiveTracker](api-docs/functions/createReactiveTracker.md): exported by
  `coaction/adapter`; low-level signal dependency tracker for framework
  adapters that need render/effect invalidation without selectors.
- [wrapStore](api-docs/functions/wrapStore.md): exported by `coaction` and
  `coaction/adapter`; low-level helper used by framework bindings.
- `signal`, `computed`, `effect`, `effectScope`, `trigger`, batching helpers, and introspection helpers: alien-signals primitives re-exported for advanced integrations.

## Semantics Worth Reading First

- Prefer explicit `sliceMode` when passing an object whose enumerable values are all functions.
- Native immutable store writes must happen inside `set()`; direct `this.count += 1` writes outside that update boundary are rejected.
- Client stores mirror shared state and their methods return promises because execution happens on the main store.
- Methods destructured from `getState()` keep the correct `this` binding.
- Getter accessors and `get(deps, selector)` computed values are cached through the built-in alien-signals runtime.
- Binder-backed integrations are whole-store adapters; slices mode is not supported for them.
- `create()` should not gain more ambiguous option combinations; prefer explicit helpers or variants for future expansion.
