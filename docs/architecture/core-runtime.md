# Core Runtime

This document is a maintainer guide to the runtime in `packages/core`. Public
types and signatures live in the [core API reference](../api/core/index.md).

## Entry points

| Entry              | Purpose                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| `coaction`         | Local stores without transport code. This entry rejects shared-only options. |
| `coaction/shared`  | Local stores, shared authorities, and client mirrors.                        |
| `coaction/adapter` | Helpers for authors of external-store adapters.                              |

New code should import the narrowest entry it needs. The entry-point isolation
is enforced by `scripts/check-core-entry-isolation.mjs`.

Local state initialization, snapshots and complete value replacements preserve
cycles, shared references, sparse arrays, enumerable symbols and null-prototype
records. Snapshot comparison treats non-plain objects as atomic identity values.
Ordinary trees use precise commit patches; values that positional patch cloning
cannot preserve use a complete root snapshot (`path: []`) in both directions.
For an unrepresentable positional edit to an ordinary tree, fallback replaces
only changed top-level keys. Replay preserves the committed result, including
its reference topology.

### Draft editing and complete graph replacement

The native `setState(recipe)` API uses Mutative drafts. It does not provide a
general graph editor: creating a cycle from draft references or editing inside
a cyclic draft is unsupported. Disabling patch generation does not remove this
restriction. Construct a complete new graph from ordinary values and replace
the field instead:

```ts
const node = { value: 1, self: null as any };
node.self = node;
store.setState({ node });
// Assigning the same complete value inside a recipe is also supported:
store.setState((draft) => {
  draft.node = node;
});
```

Do not mutate the graph after passing it to the store. Replace the entire root
with `store.apply(nextState)` when the cycle includes the root itself. Updating
an unrelated field can leave a nested cyclic value untouched; this does not
establish support for editing that value through a draft.

For acyclic shared references, Mutative drafts each access path independently.
Changing `draft.left.value` need not change `draft.right.value`, even if both
fields initially referenced the same object. Assign `draft.right = draft.left`
explicitly when the result should share that node. This is the
[Mutative shared-reference contract](https://mutative.js.org/docs/extra-topics/shared-references/).
Commit replay must preserve the resulting split or shared references, rather
than impose the topology of the previous state.

Within the supported update contract, adding a commit listener, reading a
getter or enabling history must not change the result or run the recipe twice.
Recipe errors propagate without retrying or committing a partial update. A
snapshot fallback repairs patch representation; it cannot repair an unsupported
recipe's result. Shared transport and remote sync retain their JSON contracts.

## Store creation

The shared-capable `create()` first rejects conflicting authority options, such
as combining `transport` with `clientTransport` or `worker`. It then creates one
of three modes:

- local: no transport and local mutation authority;
- main: the authority behind `transport` or an internal worker transport;
- client: a mirror backed by `clientTransport` or `worker`.

The common initialization order is:

1. create the store shell and its internal state;
2. install `setState()`, `getState()`, `subscribe()`, `apply()`, and `destroy()`;
3. resolve `sliceMode`;
4. apply middlewares in array order;
5. materialize the initial state, methods, getters, and state schema;
6. install the main or client transport when required;
7. mark the store ready and run `onStoreReady()` callbacks.

Middlewares run before state materialization, so they may wrap initialization
methods. Work that requires a complete store belongs in `onStoreReady()`. If
initialization fails, the runtime releases listeners and transports before
rethrowing the error.

## State model

The runtime keeps two related representations:

- `internal.rootState` is the data used for updates, patches, and transport;
- `internal.module` is the public state returned by `getState()`, including
  bound methods and cached getters.

Methods taken from `getState()` remain bound to the current public state.
`getPureState()` returns the data representation without methods and getters.

The top-level schema is fixed after initialization. A single store cannot add
new root fields. A slices store cannot add new slices or new root fields inside
an existing slice. Put dynamic keys below a field declared in the initial
state.

`sliceMode: 'auto'` treats an object whose values are all functions as slices,
which is ambiguous with a method-only store. Use `sliceMode: 'single'` or
`sliceMode: 'slices'` for that shape.

## Updates and patches

A local store without patches uses the shortest update path: produce the next
state, refresh cached selectors, and notify subscribers.

Shared stores, patch-enabled stores, and mutable adapters use the patch path:

1. run the updater against a draft;
2. produce forward and inverse patches;
3. let the optional middleware `patch()` hook transform the pair;
4. validate and apply the final patches atomically;
5. notify subscribers and, for a main store, emit the update.

Patch paths containing `__proto__`, `prototype`, or `constructor` are rejected.
Shared mode also validates transported state and patch values against the JSON
contract. Middleware output and adapter overrides do not bypass these checks.

Client stores are mirrors. Direct `setState()` and `apply()` calls are rejected;
updates must originate from a method executed by the main store.

## Lifecycle

`destroy()` is idempotent. It runs registered cleanup callbacks, clears
subscribers, and disposes the transport. Store operations after destruction are
rejected. Client actions waiting on transport activity are also released when
the store is destroyed.
