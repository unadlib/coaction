# Support Matrix

This document records the officially supported feature combinations for the
current codebase.

## Status Legend

- Supported
  - covered by tests and intended as a maintained contract
- Limited
  - works with a narrower guarantee than the surrounding feature might imply
- Unsupported
  - not part of the maintained contract; may throw, diverge, or remain
    untested

When in doubt, prefer documenting a combination as Limited or Unsupported
instead of implying a stronger guarantee than the test suite and runtime checks
actually enforce.

## Core Store Modes

| Combination                                | Status      | Notes                                                        |
| :----------------------------------------- | :---------- | :----------------------------------------------------------- |
| Native single store in local mode          | Supported   | Default synchronous store with local mutation authority.     |
| Native slices store in local mode          | Supported   | Official slices contract.                                    |
| Native single store as shared main store   | Supported   | Requires patch generation in shared mode.                    |
| Native slices store as shared main store   | Supported   | Same authority model as single store.                        |
| Native single store as shared client store | Supported   | Methods become async proxies to the main store.              |
| Native slices store as shared client store | Supported   | Same client authority rules as single store.                 |
| Direct `setState()` in client mode         | Unsupported | Client stores are mirrors and reject local authority writes. |
| Shared mode with `enablePatches: false`    | Unsupported | Shared synchronization depends on patch streams.             |

## Binder-Backed Adapter Matrix

Binder-backed adapters are whole-store adapters. They are never supported as a
slice nested inside a Coaction slices store.

| Adapter             | Local whole store | Shared main/client | Slices mode | Notes                                                                                                    |
| :------------------ | :---------------- | :----------------- | :---------- | :------------------------------------------------------------------------------------------------------- |
| `@coaction/zustand` | Supported         | Supported          | Unsupported | Shared contract covers remote method execution. Direct client-side Zustand writes are rejected.          |
| `@coaction/mobx`    | Supported         | Supported          | Unsupported | Shared contract covers remote method execution. Direct client-side MobX writes are integration-defined.  |
| `@coaction/pinia`   | Supported         | Supported          | Unsupported | Shared contract covers remote method execution. Direct client-side Pinia writes are integration-defined. |
| `@coaction/jotai`   | Supported         | Unsupported        | Unsupported | Official contract is local whole-store binding only.                                                     |
| `@coaction/redux`   | Supported         | Unsupported        | Unsupported | Official contract is local whole-store binding only.                                                     |
| `@coaction/valtio`  | Supported         | Unsupported        | Unsupported | Official contract is local whole-store binding only.                                                     |
| `@coaction/xstate`  | Supported         | Unsupported        | Unsupported | Official contract is local whole-store binding only.                                                     |

### Adapter Boundaries

- Binder-backed adapters are whole-store bridges.
  - Do not mount them under a slice key inside a Coaction slices object.
- Shared support means Coaction method execution is part of the contract.
  - It does not automatically mean every out-of-band write to the underlying
    external store is mirrored across a client/main topology.
- Local external writes are part of the maintained contract for official
  binder-backed adapters.
- Shared external writes to the underlying adapter store are not yet a uniform
  cross-adapter contract.
- Client-bound external writes are only supported when the adapter explicitly
  says so.
  - `@coaction/zustand` rejects them at runtime.
  - `@coaction/mobx` and `@coaction/pinia` currently leave them
    integration-defined and should not be treated as authoritative.

## Middleware and Integration Matrix

| Integration         | Local store | Shared main store | Shared client store | Notes                                                                                                       |
| :------------------ | :---------- | :---------------- | :------------------ | :---------------------------------------------------------------------------------------------------------- |
| `@coaction/logger`  | Supported   | Supported         | Limited             | Client-side logs reflect mirrored updates and proxied calls, not hidden authority-side work.                |
| `@coaction/persist` | Supported   | Supported         | Unsupported         | Rehydrate and writeback use `store.setState()`, which client stores reject. Install on the authority store. |
| `@coaction/history` | Supported   | Supported         | Unsupported         | Undo/redo mutates state through `setState()`. Install on the authority store.                               |
| `@coaction/yjs`     | Supported   | Supported         | Unsupported         | Binding rejects `store.share === 'client'`. Use on the owning store only.                                   |

## Combination Notes

### Slices and Binder-Backed Adapters

Unsupported.

Reason:

- `createBinder()` adapts an external whole-store runtime
- Coaction slices are a native state-composition model
- nesting one inside the other makes store ownership ambiguous

The runtime enforces this by throwing during initialization.

### Client Store Restricted Operations

Client stores may:

- read mirrored state
- subscribe to mirrored updates
- call store methods, which proxy execution to the main store

Client stores may not:

- call `setState()` directly
- become an independent mutation authority
- assume local middleware can authoritatively persist, time-travel, or merge
  state

### Middleware Guarantees in Worker/Client Topologies

`logger`

- Install on the main store when you need authority-side logs.
- Install on a client store only when mirror-side logging is acceptable.

`persist`

- Persist the main/shared authority store.
- Do not persist a client mirror.

`history`

- Run undo/redo on the authority store.
- Do not expose client-local undo/redo as if it were authoritative.

### Yjs Data Model Constraints

`@coaction/yjs` synchronizes the store's pure data, not Coaction runtime
behavior.

Constraints:

- keep the synced state plain and serializable
- methods and getters are excluded from the synchronized payload
- nested data is stored as `Y.Map` and `Y.Array`
- scalar conflict resolution follows Yjs semantics
- commutative behavior should be modeled with CRDT-native Yjs structures when
  needed

### Officially Supported vs Not Yet Supported

The test suite now distinguishes between:

- officially maintained adapter contracts
- combinations that may appear to work in isolated cases but are not yet a
  repository-level support promise

When extending support, update this matrix and add contract coverage in the same
change.
