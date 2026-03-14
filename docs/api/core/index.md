**coaction**

---

# Core API Reference

This reference is generated from the public `coaction` entry point in
`packages/core/index.ts`.

## Primary Entry Points

- [create](index/variables/create.md): create local stores, shared main stores, and shared
  clients.
- [Creator](index/type-aliases/Creator.md): overload matrix for `create()`.
- [Store](index/interfaces/Store.md) and [MiddlewareStore](index/interfaces/MiddlewareStore.md): runtime
  store contracts.
- [StoreOptions](index/type-aliases/StoreOptions.md) and
  [ClientStoreOptions](index/type-aliases/ClientStoreOptions.md): creation options for
  main/local and client stores.
- [Slice](index/type-aliases/Slice.md) and [Slices](index/type-aliases/Slices.md): state-factory signatures.
- [Middleware](index/type-aliases/Middleware.md): store enhancement contract.
- [createBinder](index/functions/createBinder.md): third-party store adapter helper.
- [wrapStore](index/functions/wrapStore.md): low-level helper used by framework bindings.

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
