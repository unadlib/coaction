# Core API Reference

This reference is generated from the docs-only entry point in
`packages/core/api-docs.ts`, which mirrors the public `coaction` core exports.

## Primary Entry Points

- {@link api-docs.create | create}: create local stores, shared main stores, and shared
  clients.
- {@link api-docs.Store | Store} and {@link api-docs.MiddlewareStore | MiddlewareStore}: runtime
  store contracts.
- {@link api-docs.StoreOptions | StoreOptions} and
  {@link api-docs.ClientStoreOptions | ClientStoreOptions}: creation options for
  main/local and client stores.
- {@link api-docs.Slice | Slice} and {@link api-docs.Slices | Slices}: state-factory signatures.
- {@link api-docs.Middleware | Middleware}: store enhancement contract.
- {@link api-docs.defineExternalStoreAdapter | defineExternalStoreAdapter}: third-party
  whole-store adapter helper. `createBinder` remains available as the
  compatibility name.
- {@link api-docs.wrapStore | wrapStore}: low-level helper used by framework bindings.
- `signal`, `computed`, `effect`, `effectScope`, `trigger`, batching helpers,
  and introspection helpers: alien-signals primitives re-exported for advanced
  integrations.

## Semantics Worth Reading First

- Prefer explicit `sliceMode` when passing an object whose enumerable values are
  all functions.
- Client stores mirror shared state and their methods return promises because
  execution happens on the main store.
- Methods destructured from `getState()` keep the correct `this` binding.
- Getter accessors and `get(deps, selector)` computed values are cached through
  the built-in alien-signals runtime.
- Binder-backed integrations are whole-store adapters; slices mode is not
  supported for them.
- `create()` should not gain more ambiguous option combinations; prefer
  explicit helpers or variants for future expansion.

## Regenerating

Run `pnpm docs:api` from the repository root.
