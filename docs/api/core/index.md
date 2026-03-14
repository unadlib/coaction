**coaction**

---

# Core API Reference

This reference is generated from the docs-only entry point in
`packages/core/api-docs.ts`, which re-exports the public core API together with
supporting types used in public signatures.

## Primary Entry Points

- [create](api-docs/variables/create.md): create local stores, shared main stores, and shared
  clients.
- [Creator](api-docs/type-aliases/Creator.md): overload matrix for `create()`.
- [Store](api-docs/interfaces/Store.md) and [MiddlewareStore](api-docs/interfaces/MiddlewareStore.md): runtime
  store contracts.
- [StoreOptions](api-docs/type-aliases/StoreOptions.md) and
  [ClientStoreOptions](api-docs/type-aliases/ClientStoreOptions.md): creation options for
  main/local and client stores.
- [Slice](api-docs/type-aliases/Slice.md) and [Slices](api-docs/type-aliases/Slices.md): state-factory signatures.
- [Middleware](api-docs/type-aliases/Middleware.md): store enhancement contract.
- [createBinder](api-docs/functions/createBinder.md): third-party store adapter helper.
- [wrapStore](api-docs/functions/wrapStore.md): low-level helper used by framework bindings.

## Semantics Worth Reading First

- Prefer explicit `sliceMode` when passing an object whose enumerable values are
  all functions.
- Client stores mirror shared state and their methods return promises because
  execution happens on the main store.
- Methods destructured from `getState()` keep the correct `this` binding.
- Binder-backed integrations are whole-store adapters; slices mode is not
  supported for them.

## Regenerating

Run `pnpm docs:api` from the repository root.
