# Coaction vs Zustand

This page compares Coaction with Zustand from the perspective of application
state, derived data, React subscription behavior, and integration boundaries.

Zustand is an excellent minimal React state library. Coaction intentionally
keeps a familiar Zustand-like creation API, then adds a larger default runtime:
cached getters, explicit computed dependencies, mutable update ergonomics,
framework adapters, external-store adapters, and optional worker-backed shared
state.

Use this comparison to decide whether the extra runtime surface is useful for a
project. If all you need is a tiny hook store with a few selectors, Zustand is
often the simpler fit.

## Positioning

| Axis                 | Coaction                                                                  | Zustand                                                                       |
| :------------------- | :------------------------------------------------------------------------ | :---------------------------------------------------------------------------- |
| Primary shape        | Zustand-like store runtime with built-in computed and synchronization     | Minimal React hook store with vanilla core                                    |
| Default update style | Mutable draft updates and object replacement                              | Immutable object replacement by default; mutable syntax through Immer         |
| Derived state        | Accessor getters are cached; `get(deps, selector)` supports manual deps   | Selectors and userland derived functions; no built-in computed getter runtime |
| React selectors      | Selectors are backed by signal computed values in `@coaction/react`       | Hook selectors use equality checks; selector subscriptions via middleware     |
| Slices               | Core namespace slices with explicit `sliceMode`                           | Documented pattern and utilities, not a core namespace runtime                |
| Workers              | Local, main, and client store modes with transport-backed synchronization | Vanilla stores can run outside React; no built-in worker authority model      |
| External stores      | `defineExternalStoreAdapter()` formalizes whole-store integrations        | Middleware and ecosystem-first extension model                                |
| Runtime philosophy   | More built-in production behavior                                         | Smaller, less opinionated core                                                |

## Store Creation

The entry-level store shape is deliberately familiar.

```ts
// Coaction
import { create } from '@coaction/react';

const useCounter = create((set) => ({
  count: 0,
  increment() {
    set(() => {
      this.count += 1;
    });
  }
}));
```

```ts
// Zustand
import { create } from 'zustand';

const useCounter = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 }))
}));
```

The main DX difference is that Coaction treats mutable draft updates as a
first-class path. Zustand keeps immutable replacement as the default and uses
middleware such as `immer` when mutable syntax is desired.

## Derived State

Coaction 2.0 includes `alien-signals` in the core package. Accessor getters are
cached computed values by default.

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

When the dependency list should be explicit, use the `get(deps, selector)`
computed form:

```ts
const cart = (set, get) => ({
  items: [] as Array<{ price: number; quantity: number }>,
  total: get(
    (state) => [state.cart.items],
    (items) => items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  )
});
```

In Zustand, derived state is usually expressed as a selector, a helper
function, a memoized selector, or state that is manually maintained by actions.
That is flexible, but the cache and dependency strategy belong to application
code.

```ts
const total = useCart((state) =>
  state.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
);
```

## React Selector DX

Coaction keeps Zustand's explicit selector style:

```tsx
const total = useCart((state) => state.total);
```

For repeated field-level subscriptions, `@coaction/react` also exposes a cached
auto-selector map:

```tsx
const selectors = useCart.auto();

function CartTotal() {
  const total = useCart(selectors.total);
  return <span>{total}</span>;
}
```

Zustand also has strong selector ergonomics, including strict equality by
default, `useShallow`, and `subscribeWithSelector` middleware. Coaction's
difference is that selector reactivity is part of the signal-backed runtime
used by getters and external adapter refreshes.

## Slices

Coaction treats slices as a core store shape:

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

Zustand supports slice composition as a documented pattern. Coaction's advantage
is the namespaced runtime contract; Zustand's advantage is lower ceremony and
less framework-level opinion.

## Worker-Backed State

Coaction has a built-in local/main/client authority model. The same store source
can run locally or be shared through a worker transport.

```ts
const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module'
});

const useStore = create(counterStore, { worker });
```

In client mode, reads are local mirrors and methods proxy execution to the main
store. Direct client-side `setState()` is rejected because the client is not the
mutation authority.

Zustand vanilla stores can be used outside React, including in worker code, but
cross-thread authority, method proxying, sequencing, and patch synchronization
are not built into the Zustand store contract.

## External Store Integration

Coaction 2.0 exposes `defineExternalStoreAdapter()` from the core package:

```ts
import { defineExternalStoreAdapter } from 'coaction';
```

Official adapters such as `@coaction/zustand`, `@coaction/mobx`, and
`@coaction/pinia` use this whole-store adapter contract. This matters when an
external runtime needs to remain the underlying store while Coaction provides
framework binding, shared mode, subscriptions, and signal-backed selector
refresh.

Zustand's extension model is middleware-first. That is a better fit when you
want to keep the store simple and compose behavior only as needed.

## When Zustand Is Still Better

Choose Zustand when:

- the project only needs a small React hook store
- bundle minimalism and zero-dependency core are the highest priorities
- derived data can stay in selectors or local memoization
- worker synchronization is not part of the problem
- the team wants a very mature ecosystem and broad community examples

Choose Coaction when:

- the project has repeated derived state and selector-heavy components
- mutable update DX is preferred by default
- state may need to move to a worker, SharedWorker, or multi-tab topology
- slices should be a first-class namespaced store shape
- external state libraries need to be bridged behind a formal adapter contract

## Summary

Coaction should not be positioned as "Zustand, but bigger." The stronger
positioning is:

> Zustand-like state management with built-in computed state, mutable updates,
> reactive selectors, and worker-ready synchronization.

That framing acknowledges Zustand's main strength while making Coaction's
default production surface clear.
