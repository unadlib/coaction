# @coaction/yjs

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/yjs.svg)](https://www.npmjs.com/package/@coaction/yjs)
![license](https://img.shields.io/npm/l/@coaction/yjs)

A Coaction integration tool for Yjs.

## Installation

```sh
npm install coaction @coaction/yjs
```

## Quick Start

```ts
import { create } from 'coaction';
import { yjs } from '@coaction/yjs';

const store = create(
  (set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }),
  {
    middlewares: [yjs()]
  }
);
```

## Sync Model

- The binding stores state under `doc.getMap(key).get('state')`.
- `state` is persisted as nested `Y.Map` / `Y.Array` structures.
- Local Coaction updates are synced to Yjs.
- Remote Yjs updates are replayed back into Coaction.
- Writes are diff-based against the last synced local snapshot to reduce overwrite risk in concurrent edits.

## Conflict Semantics

- Concurrent updates to different fields can converge through Yjs merge behavior.
- Concurrent updates to the same field follow Yjs conflict semantics (effectively last-writer-wins for scalar fields).
- If you need commutative semantics (for example counters), use CRDT-native field modeling in Yjs for that field.

## Provider Integration

`@coaction/yjs` only binds a Coaction store to a `Y.Doc`. Network transport is provided by your Yjs provider (for example `y-websocket`, `y-webrtc`, or a custom provider).

```ts
import { create } from 'coaction';
import { bindYjs } from '@coaction/yjs';
import { Doc } from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const doc = new Doc();
const provider = new WebsocketProvider('wss://your-server', 'room-id', doc);

const store = create((set) => ({
  count: 0,
  increment() {
    set((draft) => {
      draft.count += 1;
    });
  }
}));

const binding = bindYjs(store, {
  doc,
  key: 'counter'
});

// later
binding.destroy();
provider.destroy();
store.destroy();
```

## API

### `bindYjs(store, options?)`

Binds a Coaction store to Yjs and returns a binding object.

- `options.doc?: Y.Doc`
  - Reuse an existing doc for multi-peer collaboration.
  - If omitted, an internal `Y.Doc` is created.
- `options.key?: string`
  - Root map key for this store namespace.
  - Default: `coaction:${store.name}`.

Returns:

- `doc: Y.Doc`
- `map: Y.Map<any>`
- `syncNow(): void`
  - Pushes the current local state to Yjs immediately.
- `destroy(): void`
  - Unsubscribes observers and releases resources.
  - Destroys `doc` only when it was internally created.

### `yjs(options?)`

Middleware wrapper around `bindYjs`. It also wires cleanup into `store.destroy()`.

## State Requirements

- Keep the synced state plain and serializable.
- Methods and getters are Coaction runtime behavior and are not the synchronization payload.
- Prefer a plain object at the root of your store state.

## Compatibility and Limits

- Not supported in `store.share === 'client'` mode.
- Very large or highly volatile state trees can produce heavy update traffic.
- Cleanup is required: always call `binding.destroy()` (or `store.destroy()` when using middleware).

## Migration Notes

- Current storage shape uses `Y.Map`/`Y.Array` for nested state.
- If old data stored `state` as a plain object, the binding migrates it to Yjs structures automatically.
- If you read Yjs state directly, do not assume `map.get('state').count`; `state` is usually a `Y.Map`.

## Troubleshooting

- `setState cannot be called within the updater`
  - Indicates re-entrant updates in your app flow. Avoid nested synchronous state loops.
- State not syncing across peers
  - Verify all peers use the same room/doc provider and same `key`.
- Unexpected stale updates
  - Ensure `destroy()` is called for old bindings to avoid duplicate observers.
- High update volume
  - Reduce write frequency (debounce/throttle app-level updates if needed).

## Documentation

You can find the project documentation [here](https://github.com/unadlib/coaction).
