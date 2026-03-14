# Core API Reference

This reference is generated from the docs-only entry point in
`packages/core/api-docs.ts`, which re-exports the public core API together with
supporting types used in public signatures.

## Primary Entry Points

- {@link api-docs.create | create}: create local stores, shared main stores, and shared
  clients.
- {@link api-docs.Creator | Creator}: overload matrix for `create()`.
- {@link api-docs.Store | Store} and {@link api-docs.MiddlewareStore | MiddlewareStore}: runtime
  store contracts.
- {@link api-docs.StoreOptions | StoreOptions} and
  {@link api-docs.ClientStoreOptions | ClientStoreOptions}: creation options for
  main/local and client stores.
- {@link api-docs.Slice | Slice} and {@link api-docs.Slices | Slices}: state-factory signatures.
- {@link api-docs.Middleware | Middleware}: store enhancement contract.
- {@link api-docs.createBinder | createBinder}: third-party store adapter helper.
- {@link api-docs.wrapStore | wrapStore}: low-level helper used by framework bindings.

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
