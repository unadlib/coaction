# DevTools Roadmap

This document defines the current DevTools position for Coaction and the shape
of a future first-party DevTools package.

Coaction already exposes middleware hooks, method trace events, patch streams,
store subscriptions, and pure-state snapshots. Those pieces are enough for
logging and project-specific tooling, but they are not yet a complete
Zustand/Redux-DevTools-style product experience.

## Current State

Available today:

- `@coaction/logger` for console-oriented method, patch, and timing output
- middleware access to `setState()`, `apply()`, `destroy()`, `patch()`, and
  `trace()` compatibility hooks
- `getPureState()` for serializable state snapshots without methods or getters
- patch generation in shared mode and when `enablePatches` is enabled
- local/main/client store metadata through `store.share`

Not available today:

- first-party browser extension
- first-party timeline UI
- built-in action replay UI
- Redux DevTools protocol adapter
- visual inspection for signal-backed computed dependencies

## Why This Matters

Zustand users often expect DevTools support through middleware. Coaction has a
larger runtime surface than Zustand, so debugging should eventually cover more
than action names and state snapshots.

A Coaction DevTools story should explain:

- where a mutation executed: local store, shared main store, or client proxy
- which method triggered the update
- whether the update produced patches
- what state changed after patch application
- which client stores received mirrored updates
- which adapter or middleware participated in the update
- whether a computed getter or selector was refreshed after an external write

## Proposed Package

A future package should likely be named:

```txt
@coaction/devtools
```

The first API should be middleware-first, because that matches the current
runtime extension model:

```ts
import { create } from 'coaction';
import { devtools } from '@coaction/devtools';

const store = create(createState, {
  middlewares: [
    devtools({
      name: 'cart'
    })
  ]
});
```

React-specific UI helpers can come later. The first useful contract is a stable
event stream that other tools can consume.

## Event Model

The initial event stream should include:

- store lifecycle events
  - created
  - destroyed
  - connected as shared client
  - connected as shared main
- method trace events
  - method name
  - slice key
  - parameters
  - result or thrown error
  - duration
- state update events
  - previous pure state
  - next pure state
  - patches and inverse patches when available
  - sequence number in shared mode
- adapter events
  - external write observed
  - external write rejected
  - adapter cleanup
- computed/reactivity events
  - signal slot refresh after external immutable writes
  - selector notification after selected value changes

The public event schema should avoid exposing private `Internal` fields. If an
internal value must be inspected, expose it through a stable adapter in core
first.

## Shared Mode Requirements

DevTools must respect Coaction's authority model:

- main stores own mutation execution
- client stores are mirrors
- client-side method calls should be displayed as proxy requests, not local
  mutations
- direct client-side `setState()` remains unsupported
- persisted or replayed updates should target the authority store

This is the largest difference from a simple local-store DevTools integration.

## Computed and Selector Requirements

Coaction 2.0 uses `alien-signals` internally for cached getters and React
selector reactivity. DevTools should not start by exposing the full signal graph.
That would couple tooling to implementation details too early.

The first useful computed-state view is simpler:

- show computed getter values in snapshots
- mark getters as derived instead of plain data
- show when signal-backed selector subscriptions notify React
- show when adapter-triggered writes call `notifyStateChange()`

Full dependency graph visualization can be considered later if real debugging
use cases justify the extra API surface.

## Compatibility With Redux DevTools

Redux DevTools protocol support is useful, but it should be treated as an
adapter target rather than the only DevTools product.

Recommended order:

1. Define a Coaction-native event stream.
2. Build a console/file sink for that stream.
3. Add a Redux DevTools protocol bridge for action timeline and snapshots.
4. Add Coaction-specific views for shared mode, adapters, and computed state.

This keeps the core event model independent from Redux DevTools limitations.

## Non-Goals

The first DevTools package should not:

- change store semantics
- make client stores mutation authorities
- depend on React
- expose private runtime internals as public API
- require patch generation for every local store by default
- promise deterministic replay for non-serializable state, methods, getters, or
  external runtime objects

## Near-Term Documentation Position

Until `@coaction/devtools` exists, public docs should say:

- use `@coaction/logger` for console-level tracing
- use `getPureState()` for serializable snapshots
- enable patches only when middleware or shared synchronization needs them
- install persistence, history, and future DevTools on the authority store in
  shared mode
- do not present client-local tooling as authoritative state history

This is enough to avoid overclaiming while still making the roadmap explicit.
