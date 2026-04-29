**coaction**

---

# Core API Reference

This reference is generated from the docs-only entry point in
`packages/core/api-docs.ts`, which mirrors the public `coaction` core exports.

## Primary Entry Points

- [create](api-docs/variables/create.md): create local stores, shared main stores, and shared
  clients.
- [Store](api-docs/interfaces/Store.md) and [MiddlewareStore](api-docs/interfaces/MiddlewareStore.md): runtime
  store contracts.
- [StoreOptions](api-docs/type-aliases/StoreOptions.md) and
  [ClientStoreOptions](api-docs/type-aliases/ClientStoreOptions.md): creation options for
  main/local and client stores.
- [Slice](api-docs/type-aliases/Slice.md) and [Slices](api-docs/type-aliases/Slices.md): state-factory signatures.
- [Middleware](api-docs/type-aliases/Middleware.md): store enhancement contract.
- [defineExternalStoreAdapter](api-docs/functions/defineExternalStoreAdapter.md): third-party
  whole-store adapter helper. `createBinder` remains available as the
  compatibility name.
- [wrapStore](api-docs/functions/wrapStore.md): low-level helper used by framework bindings.
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
