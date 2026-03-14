# Threading Model

This document explains how Coaction treats local, main, and client runtimes.

## Modes

### Standard Mode

Standard mode is a local store with no transport.

Characteristics:

- synchronous methods
- no cross-thread synchronization
- patch generation is optional and disabled by default
- the local runtime owns mutation authority

### Shared Main Mode

Shared main mode is the authoritative store behind a transport.

Characteristics:

- methods execute locally on the main runtime
- `internal.sequence` advances when patch updates are emitted
- clients may request method execution through the transport
- full state snapshots are served through `fullSync`

### Shared Client Mode

Shared client mode is a mirror of a main store.

Characteristics:

- methods are async because execution happens on the main store
- local state is a mirror updated through `update` and `fullSync`
- direct `setState()` is rejected
- reconnects and sequence gaps fall back to `fullSync`

## Authority Model

There is exactly one write authority in shared mode: the main store.

The client store may:

- read mirrored state
- subscribe to mirrored updates
- request method execution on the main store

The client store may not:

- call `setState()` directly
- assume local mutations are authoritative
- bypass sequence handling

This model keeps transport semantics simple. Client-side state is eventually
consistent with the main store, but write authority never moves to the client.

## Execution Flow for Shared Methods

When a client invokes a store method:

1. the client method wrapper emits `execute`
2. the main store resolves the method path and executes it against the current
   state object
3. the main store mutates state and may emit a patch `update`
4. the main store returns `[result, sequence]`
5. the client waits until its mirrored sequence catches up
6. if sequencing is stale or a gap is detected, the client falls back to
   `fullSync`

This means the returned promise represents both remote execution and the local
mirror catching up to the corresponding state version.

## External Writes

"External write" means a state change initiated outside a normal Coaction store
method, for example:

- a third-party store notifies Coaction about a direct mutation
- a transport reconnect requires replacing mirrored client state through
  `fullSync`
- Yjs replays remote document updates into Coaction

These writes are supported, but they must flow through the owning runtime's
contract:

- binder-backed adapters must update Coaction through their store hook
- clients must accept transport-driven `update` or `fullSync`
- middleware integrations must avoid re-entrant write loops

## Supported Threading Combinations

Officially supported:

- local store only
- one main store with one or more clients
- worker-backed or custom-transport shared stores
- slices in shared mode, as long as the underlying state is native Coaction

Officially unsupported:

- client-mode Yjs binding
- binder-backed adapter nested inside slices mode
- shared stores created with patch generation explicitly disabled

## Guarantee Levels

The runtime makes three distinct guarantee levels:

- Strong contract
  - local/main authority, client `setState()` rejection, sequence-based catch-up
- Best-effort synchronization
  - client reconnect recovery through `fullSync`
- Integration-defined behavior
  - external state libraries, persistence backends, CRDT providers, framework
    lifecycles

When documenting package-level features, maintainers should say which level a
feature belongs to. If a guarantee is integration-defined, the docs should not
present it as a core invariant.
