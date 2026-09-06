# Adapter Contribution Guide

This guide is for adding or changing an official adapter package.

Adapter implementations import `defineExternalStoreAdapter()` and the
compatibility alias `createBinder()` from `coaction/adapter`.

## 1. Choose the Right Integration Shape

Before writing code, decide which family the new integration belongs to.

- Binder-backed adapter
  - Bridges an external whole-store runtime into Coaction through `defineExternalStoreAdapter()` or the compatibility alias `createBinder()`
  - Examples: Zustand, MobX, Pinia, Redux, Jotai, Valtio, XState
- Middleware integration
  - Extends a Coaction-owned store without replacing store ownership
  - Examples: logger, persist, history, yjs
- Framework wrapper
  - Adapts a Coaction store to framework-specific subscription and lifecycle behavior

If the integration needs to own its own external state runtime, it is usually a binder-backed adapter. If it only decorates a Coaction store, it is usually middleware.

## 2. Follow the Contract

Read these documents before implementation:

- [Architecture Overview](../architecture/overview.md)
- [Adapter Contract](../architecture/adapter-contract.md)
- [Support Matrix](../architecture/support-matrix.md)
- [API Evolution](../architecture/api-evolution.md)

For binder-backed adapters, the key rule is unchanged:

- bind a whole store, not a slice

## 3. Implement the Package

For a binder-backed adapter:

1. Build the binding through `defineExternalStoreAdapter()`
2. Normalize external state in `handleState`
3. Wire Coaction lifecycle into the external runtime in `handleStore`
4. Say how to write into the runtime with `internal.externalApply`, and nothing more
5. Preserve the store contract when overriding `subscribe()` or `destroy()`
6. Call `internal.notifyStateChange()` after direct external immutable writes that update `internal.rootState` without using `store.setState()` or `store.apply()`

### The write boundary

`store.apply` belongs to Coaction. An adapter sets `internal.externalApply` —
how to get a change onto its own runtime — and Coaction does the rest: it works
out the patch pair before the change, runs commit validators, calls the writer,
and publishes the commit.

```ts
internal.externalApply = (state = store.getPureState(), patches) => {
  // write into the runtime; do not publish a commit
};
```

Do not replace `store.apply`. Adapters used to, and it took on commit semantics
they did not want — none of them published a commit, so a direct `apply` changed
the state and told nobody — while discarding anything middleware had wrapped
`apply` with, since middleware runs first. See
[`store.apply` belongs to Coaction](../migration/adapter-write-boundary.md).

An adapter whose runtime only accepts changes through its own channel needs no
writer at all. Refuse from `internal.assertMutationAllowed` and let the ordinary
`apply` do the work — `@coaction/xstate` does exactly that.

Implementation expectations:

- keep `destroy()` idempotent
- make external write behavior explicit
- do not invent a second write authority for client mode
- avoid package-specific transport rules that bypass Coaction sequencing

## 4. Add Contract Coverage

Official binder-backed adapters must use the shared contract suite in `packages/core/test/binderAdapterContract.ts`, and the commit conformance suite in `packages/core/test/binderCommitConformance.ts`.

Required:

- add a `test/contract.test.ts` file for the package
- add a `test/commitConformance.test.ts` file, so both forms of `store.apply` publish exactly once, replay to the state they produced, and leave a middleware wrapper working
- cover local whole-store behavior
- cover shared main/client behavior only if that mode is an official contract
- include a type-expectation test

Keep package-specific tests for unique behavior:

- adapter-specific errors
- integration quirks
- branch coverage around cleanup or edge cases

## 5. Update the Support Matrix

Every adapter change must update [support-matrix.md](../architecture/support-matrix.md) when it changes any official guarantee:

- local support
- shared main/client support
- slices compatibility
- middleware or external-write guarantees

Do not merge new behavior without updating the declared support status.

## 6. Update Package Docs

At minimum:

- package README quick-start still works
- compatibility notes match the support matrix
- limitations are stated directly, not implied

If the adapter expands or narrows support, update the root README maintenance links when needed.
