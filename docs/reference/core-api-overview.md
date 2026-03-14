# Core API Reference

This reference is generated from the public `coaction` entry point in
`packages/core/index.ts`.

## Primary Entry Points

- {@link index.create | create}: create local stores, shared main stores, and shared
  clients.
- {@link index.Creator | Creator}: overload matrix for `create()`.
- {@link index.Store | Store} and {@link index.MiddlewareStore | MiddlewareStore}: runtime
  store contracts.
- {@link index.StoreOptions | StoreOptions} and
  {@link index.ClientStoreOptions | ClientStoreOptions}: creation options for
  main/local and client stores.
- {@link index.Slice | Slice} and {@link index.Slices | Slices}: state-factory signatures.
- {@link index.Middleware | Middleware}: store enhancement contract.
- {@link index.createBinder | createBinder}: third-party store adapter helper.
- {@link index.wrapStore | wrapStore}: low-level helper used by framework bindings.

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
