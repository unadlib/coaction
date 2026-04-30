# Migrating from Zustand

Coaction uses a Zustand-like store creation API, so many stores can be moved in
small steps. The goal of a migration should not be to rewrite every selector or
action immediately. Start with API compatibility, then adopt Coaction features
where they remove real code: cached getters, mutable updates, slices, external
adapters, and worker-backed shared mode.

## 1. Install Coaction

React applications usually install both packages:

```sh
npm install coaction @coaction/react
```

Core or non-React usage only needs:

```sh
npm install coaction
```

Coaction 2.0 includes `alien-signals` internally. Do not install
`@coaction/alien-signals`.

## 2. Change the Import

For React hooks:

```diff
- import { create } from 'zustand';
+ import { create } from '@coaction/react';
```

For vanilla stores:

```diff
- import { createStore } from 'zustand/vanilla';
+ import { create } from 'coaction';
```

## 3. Keep Simple Stores First

Most simple Zustand stores are structurally close to Coaction stores.

```ts
const useCounter = create((set, get) => ({
  count: 0,
  increment: () => set({ count: get().count + 1 }),
  reset: () => set({ count: 0 })
}));
```

This can stay close to the original code. After it works, move update-heavy
actions to Coaction's draft style when that improves readability.

```ts
const useCounter = create((set) => ({
  count: 0,
  increment() {
    set(() => {
      this.count += 1;
    });
  },
  reset() {
    set(() => {
      this.count = 0;
    });
  }
}));
```

## 4. Replace Manual Derived State with Getters

Zustand derived state is often expressed as selectors:

```tsx
const total = useCart((state) =>
  state.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
);
```

In Coaction, repeated derived state usually belongs in an accessor getter:

```ts
const useCart = create((set) => ({
  items: [] as Array<{ price: number; quantity: number }>,
  get total() {
    return this.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  },
  add(item: { price: number; quantity: number }) {
    set(() => {
      this.items.push(item);
    });
  }
}));
```

Then React components can subscribe to the computed value directly:

```tsx
const total = useCart((state) => state.total);
```

Accessor getters are cached through Coaction's built-in `alien-signals`
runtime.

## 5. Use `get(deps, selector)` for Manual Dependencies

Keep accessor getters as the default. Use Coaction's manual computed form when
the dependency list should be explicit, such as cross-slice derived data.

```ts
const cart = (set, get) => ({
  items: [] as Array<{ price: number; quantity: number }>,
  total: get(
    (state) => [state.cart.items],
    (items) => items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  )
});
```

The same `get` helper still reads the current store when called with no
arguments:

```ts
const count = get().count;
```

## 6. Convert Slice Patterns Deliberately

Zustand slice composition is commonly written as function spreading:

```ts
const useStore = create((...args) => ({
  ...createCounterSlice(...args),
  ...createSessionSlice(...args)
}));
```

Coaction can keep a single flat store, but it also supports namespaced slices as
a core mode:

```ts
const useStore = create(
  {
    counter: (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    session: (set) => ({
      userId: null as string | null,
      setUser(userId: string) {
        set(() => {
          this.userId = userId;
        });
      }
    })
  },
  { sliceMode: 'slices' }
);
```

Use `sliceMode: 'slices'` explicitly when passing an object of slice factories.
Use `sliceMode: 'single'` if an object-shaped store only contains methods and
should not be inferred as slices.

## 7. Update React Selector Usage

Direct selectors remain the normal React path:

```tsx
const count = useStore((state) => state.counter.count);
```

For repeated field selectors, use the cached auto-selector map:

```tsx
const selectors = useStore.auto();

function Counter() {
  const count = useStore(selectors.counter.count);
  const increment = useStore(selectors.counter.increment);
  return <button onClick={increment}>{count}</button>;
}
```

`useStore({ autoSelector: true })` remains available as an alias, but
`useStore.auto()` is the clearer form for new code.

## 8. Replace Middleware One at a Time

Map common Zustand middleware to Coaction features deliberately:

| Zustand usage            | Coaction path                                                                 |
| :----------------------- | :---------------------------------------------------------------------------- |
| `immer`                  | Prefer Coaction draft updates through `set(() => { ... })`                    |
| `persist`                | Use `@coaction/persist`; install it on the authority store in shared mode     |
| `subscribeWithSelector`  | Prefer React selectors, auto selectors, or integration-level signal computed  |
| `devtools`               | Track through project-specific tooling today; see the DevTools roadmap notes  |
| custom external runtimes | Use `defineExternalStoreAdapter()` for whole-store adapters                   |
| existing Zustand runtime | Use `@coaction/zustand` when the Zustand store should remain the source store |

Middleware should be moved after the base store behavior is verified. This makes
it easier to separate state-shape changes from integration changes.

## 9. Decide Whether to Keep Zustand Underneath

A migration does not always need to replace the underlying Zustand runtime.

Use native Coaction stores when:

- the state model can be owned by Coaction
- cached getters and slices should be first-class
- worker-backed shared mode is part of the architecture

Use `@coaction/zustand` when:

- an existing Zustand store is already public API
- other modules depend on the Zustand store directly
- Coaction should wrap the whole store for framework binding or shared-mode
  orchestration

Third-party state adapters are whole-store integrations. They are not supported
inside Coaction slices mode.

## 10. Consider Shared Mode Last

Do not start a migration by moving the store into a worker. First make the
local store pass its tests. Then introduce shared mode where the architecture
actually needs it.

```ts
const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module'
});

const useStore = create(createCounterStore, { worker });
```

In shared mode, the worker/main store is the mutation authority. Client stores
read mirrored state and call methods that execute on the main store. Direct
client-side `setState()` calls are rejected.

## Migration Checklist

- Change imports.
- Keep simple object updates until the store is passing tests.
- Convert repeated derived selectors into accessor getters.
- Use `get(deps, selector)` only where explicit dependencies help.
- Move Zustand slice spreading to `sliceMode: 'slices'` only when namespaces are
  useful.
- Replace middleware one at a time.
- Keep existing Zustand stores through `@coaction/zustand` when replacing the
  underlying runtime would be too disruptive.
- Introduce worker-backed shared mode after local behavior is stable.
