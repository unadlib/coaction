# coaction

![Node CI](https://github.com/coactionjs/coaction/workflows/Node%20CI/badge.svg) [![npm](https://img.shields.io/npm/v/coaction.svg)](https://www.npmjs.com/package/coaction) ![license](https://img.shields.io/npm/l/coaction)

[English documentation](https://coactionjs.github.io/coaction/en/docs/) · [中文文档](https://coactionjs.github.io/coaction/zh/docs/)

An efficient and flexible state management library for building high-performance, multithreading web applications.

Coaction uses `alien-signals` internally for cached getter/computed state, React selector reactivity, and adapter-facing subscriptions. The core package also re-exports the signal primitives for advanced integrations.

## Installation

Install it with pnpm:

```sh
pnpm add coaction
```

## Usage

```jsx
import { create } from 'coaction';

const store = create((set) => ({
  count: 0,
  get doubleCount() {
    return this.count * 2;
  },
  increment() {
    set(() => {
      this.count += 1;
    });
  }
}));
```

Core stores are immutable by default. Getters and methods can read through `this`, but writes to Coaction-owned state must happen inside `set()` or `set((draft) => ...)`. Direct writes such as `this.count += 1` in a store method throw because they bypass the commit path that notifies subscribers, produces patches when enabled, and synchronizes worker/client mirrors in shared mode.

Coaction fixes the public state schema after initialization. A single store cannot add new top-level state keys later, and a slices store cannot add new slice keys or new top-level fields inside a slice. Replacement-style APIs such as `apply()` may omit a known single-store root key; the public getter remains present and reads as `undefined`, but no unknown key is promoted into the public module. Slice root keys are stricter and cannot be removed or replaced with non-object values. Keep dynamic data inside an existing object or array field.

Mutable adapters such as MobX, Pinia, and Valtio keep Coaction raw state, public state, and the external mutable runtime synchronized for known schema keys. Coaction still treats its raw/public schema as authoritative: out-of-band unknown properties written directly onto a third-party mutable runtime are not promoted into Coaction state, and adapter-specific docs define whether that external runtime property is pruned, restored, or left to the underlying library.

Accessor getters are cached automatically through the built-in signal runtime. Use `get(deps, selector)` when you want to declare dependencies manually:

```ts
const store = create((set, get) => ({
  count: 0,
  doubleCount: get(
    (state) => [state.count],
    (count) => count * 2
  ),
  increment() {
    set(() => {
      this.count += 1;
    });
  }
}));
```

Local stores can import signal primitives from `coaction`. Adapter authors use
the statically separate `coaction/adapter` entry:

```ts
import { computed, effect, signal } from 'coaction';
import { defineExternalStoreAdapter } from 'coaction/adapter';
```

### What a draft permits

`set()` hands you a draft: write it like a plain object and Coaction publishes
an immutable result. What it reaches into is deliberately narrow — arrays, and
objects made of nothing but properties, which includes anything built with
`Object.create` over a plain prototype. Array holes and the ordinary and symbol
properties an array carries survive, and so do non-enumerable properties.

Everything else is a leaf: replaced whole, never edited in place. A draft
refuses what it cannot describe honestly, each with
`UnsupportedDraftOperationError`:

- Reading a value a constructor built — a `Map`, `Set`, `Date`, typed array,
  `URL`, `Error`, or an instance of your own class. These keep state a property
  copy would not carry, so editing one changes the store with nothing recorded.
  Read it from the state and assign a replacement.
- `Object.defineProperty`, `Object.setPrototypeOf`, `Object.preventExtensions`.
  Build the value you want and assign it.
- A path that runs back through an object it already passed. A patch names a
  path, so a cycle has no transition to describe.
- Any write after the draft is finalized. Its result is already the published
  state, so a late write would change the store with no commit behind it.

One boundary is a contract rather than a check. A patch names a path, so it
cannot say that two paths hold the same object: writing through one of two
aliases changes that position and leaves the other holding the old value.
Finding every alias would mean scanning the whole state on every write, so
Coaction does not — replace the whole branch when a shared object has to change.

### Transitions

A state change becomes a commit: the next state, the patches that produced it,
and their inverses. That format is Coaction's, declared in `Patch` / `Patches`,
and it is what `@coaction/history`, `@coaction/sync`, the shared transport and
reactive invalidation all read.

Coaction produces and applies them itself, over that tree and no wider.
`coaction/adapter` publishes what a middleware needs — `applyPatches`,
`diffPatches`, `producePatches`, `scopeDraft`, `openDraft` — so nothing
downstream reaches for a draft library of its own.

### Adapter and Middleware Utilities

`coaction/adapter` exports utilities for adapter and middleware authors. These are not needed for normal application state updates, but they are part of the supported integration surface used by the official packages:

- Mutable adapter helpers: `applyMutableAdapterPatches`, `replaceMutableAdapterState`, `toMutableAdapterSnapshot`, `snapshotMutableAdapterPureState`, `isEqualMutableAdapterSnapshot`, `getMutableAdapterOwnEnumerableKeys`, `isMutableAdapterUnsafeKey`.
- Root replacement helpers: `createRootReplacementPatches`, `applyRootReplacementWithPatches`.
- Patch safety helpers: `assertSafePatches`, `sanitizePatches`, `UnsafePatchPathError`.
- State shape helpers: `StateSchemaError`, `isStateSchemaError`, `sanitizeReplacementState`, `sanitizeInitialStateValue`, `replaceOwnEnumerable`.

Runtime mutation paths reject unsafe patch paths before applying state changes. If a `store.patch()` hook returns a path containing `__proto__`, `prototype`, or `constructor`, Coaction throws `UnsafePatchPathError` instead of silently dropping that patch and applying the rest.

### Shared JSON contract

Import `create` from `coaction/shared` when state crosses a Worker,
SharedWorker, or injected transport boundary:

```ts
import { create } from 'coaction/shared';
```

Shared state, action arguments, action results, patch values, and full-sync
snapshots must be JSON trees: finite numbers, strings, booleans, null, dense
arrays, and plain records. Coaction rejects values that JSON would normalize or
cannot represent losslessly, including `undefined`, `BigInt`, `NaN`, infinity,
negative zero, functions in data, symbols, accessors, platform objects, sparse
arrays, circular references, and repeated object references. Local stores do
not inherit this restriction.

An authority and every connected client must use the same Coaction major and
wire protocol. Mixed-major shared deployments are unsupported.

Store methods using `this` are rebound to the latest state when invoked from `getState()`, so destructuring remains safe:

```ts
const store = create((set) => ({
  count: 0,
  increment() {
    set(() => {
      this.count += 1;
    });
  }
}));

const { increment } = store.getState();
increment();
```

## API Reference

- [Generated core API index](https://github.com/coactionjs/coaction/blob/main/docs/api/core/index.md)
- [Core API notes](https://github.com/coactionjs/coaction/blob/main/docs/api/core/documents/core-api-notes.md)

### Store Shape Mode (`sliceMode`)

`create()` uses `sliceMode: 'auto'` by default. For backward compatibility, `auto` still treats a non-empty object whose enumerable values are all functions as slices. That shape is ambiguous with a plain store that only contains methods, so development builds warn and you should set `sliceMode` explicitly.

You can force behavior explicitly:

- `sliceMode: 'single'`: treat object input as a single store.
- `sliceMode: 'slices'`: require object-of-slice-functions input.

```ts
create({ ping: () => 'pong' }, { sliceMode: 'single' });
create({ counter: (set) => ({ count: 0 }) }, { sliceMode: 'slices' });
```

## Documentation

You can find the documentation [here](https://github.com/coactionjs/coaction).
