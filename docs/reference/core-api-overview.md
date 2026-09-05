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

- {@link api-docs.create | create}: exported by `coaction` and
  `coaction/shared`; creates local stores, shared main stores, and shared
  clients.
- {@link api-docs.createLocal | create from coaction}: documentation name
  for the transport-free implementation exported as `create` by
  `coaction`. `createLocal` is not a root-package export.
- {@link api-docs.Store | Store} and {@link api-docs.MiddlewareStore | MiddlewareStore}: runtime store contracts.
- {@link api-docs.StoreOptions | StoreOptions} and {@link api-docs.ClientStoreOptions | ClientStoreOptions}: creation options for main/local and client stores.
- {@link api-docs.Slice | Slice} and {@link api-docs.Slices | Slices}: state-factory signatures.
- {@link api-docs.Middleware | Middleware}: store enhancement contract.
- {@link api-docs.defineExternalStoreAdapter | defineExternalStoreAdapter}:
  exported by `coaction/adapter`; third-party whole-store adapter helper.
  `createBinder` remains available there as the compatibility name.
- {@link api-docs.createReactiveTracker | createReactiveTracker}: exported by
  `coaction/adapter`; low-level signal dependency tracker for framework
  adapters that need render/effect invalidation without selectors.
- {@link api-docs.wrapStore | wrapStore}: exported by `coaction` and
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
