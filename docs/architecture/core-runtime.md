# Core Runtime

This document is a maintainer guide to the runtime in `packages/core`. Public
types and signatures live in the [core API reference](../api/core/index.md).

## Entry points

| Entry              | Purpose                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| `coaction`         | Local stores without transport code. This entry rejects shared-only options. |
| `coaction/shared`  | Local stores, shared authorities, and client mirrors.                        |
| `coaction/adapter` | Helpers for authors of external-store adapters.                              |
| `coaction`         | Compatibility entry with the same shared-capable `create()` behavior.        |

New code should import the narrowest entry it needs. The entry-point isolation
is enforced by `scripts/check-core-entry-isolation.mjs`.

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
