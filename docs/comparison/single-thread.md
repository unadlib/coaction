# Why Coaction Without Multithreading

Multithreading is Coaction's headline capability, but most teams reach for a state library to solve everyday single-threaded problems first. This page makes the case that **even with no worker in sight, Coaction is a more ergonomic Zustand-style store** — and it tries to be honest about where Zustand still wins.

The argument is _not_ that any single feature here is unique. Zustand's ecosystem can assemble equivalents for each of them (`react-tracked` for usage tracking, `zustand-computed` / `@csark0812/zustand-getters` for derived state, auto-selector generators for boilerplate). The argument is that Coaction keeps **automatic tracking and getter/computed invalidation on one signal graph**, while explicit selectors and `this` ergonomics stay available as escape hatches, instead of four plugins with four mental models.

## The four single-thread pillars

### 1. `observer()` — automatic nested path tracking

Wrap a component in `observer()` and native immutable state reads during render become path dependencies, including nested reads. No selector or `useShallow` is needed to declare those dependencies.

```tsx
import { create, observer } from '@coaction/react';

const useStore = create((set) => ({
  first: 'Ada',
  last: 'Lovelace',
  age: 36,
  birthday() {
    set(() => {
      this.age += 1;
    });
  }
}));

const Name = observer(() => {
  const store = useStore();
  // reads top-level first + last → re-renders only when first or last change.
  // `age` changes do NOT re-render this component.
  return (
    <span>
      {store.first} {store.last}
    </span>
  );
});
```

`observer()` collects render reads through the reactive tracker. Reading `state.user.name` can avoid invalidation after an age-only recipe update. Parent replacements, array structure changes and graph snapshot patches can invalidate more broadly; dependency tracking does not promise one exact notification for every possible update shape.

> **Caveat:** mutable external-adapter instances do not support native cached getters or `get(deps, selector)` computed values. Their observation granularity follows the adapter's update and snapshot contract; the native deep-tracking guarantee does not imply identical behavior for every external runtime.

### 2. Cached getters — derived state that memoizes itself

Accessor getters are wrapped in `alien-signals` computed values, so repeated reads are cached until a dependency changes. No `useMemo`, no reselect.

Native getters read frozen snapshots at the store/slice field boundary. A getter reading `this.user.name` invalidates when `user.age` changes too. Its unchanged result can still suppress downstream work. The optional `coaction/derived` entry provides `derive(..., { deep: true })` and `derivePath` for managed reads with finer dependencies; see the [computed guide](https://coactionjs.github.io/coaction/en/docs/concepts/computed).

```ts
const useCart = create((set) => ({
  items: [] as Array<{ price: number; quantity: number }>,
  get total() {
    // cached; recomputed only when `items` changes
    return this.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  },
  add(item: { price: number; quantity: number }) {
    set(() => {
      this.items.push(item);
    });
  }
}));
```

### 3. Escape hatches — explicit control when you want it

Automatic tracking is the default, not a cage. When you prefer explicit subscriptions you keep the full Zustand-style toolbox plus a couple of extras:

```tsx
// classic selector (familiar Zustand DX)
const total = useCart((state) => state.total);

// cached auto-selector map
const selectors = useCart.auto();
const total2 = useCart(selectors.total);

// explicit computed dependencies (cross-slice / adapter code)
const cart = (set, get) => ({
  items: [] as Array<{ price: number; quantity: number }>,
  total: get(
    (state) => [state.cart.items],
    (items) => items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  )
});
```

> **Selector execution and rendering are separate.** `useStore(selector)` collects nested path dependencies, so unrelated recipe writes can skip selector execution. Zustand's default hook evaluates the selected snapshot on store notifications and uses `Object.is` to determine whether it changed; application memoization can skip work inside the selector. Coaction also compares selected results with `Object.is`. `observer()` collects the component's render reads directly. Replacements and structural changes can broaden invalidation in both Coaction read styles.

### 4. `this` and getters — natural this-bound ergonomics

You can use `this` in getters and actions, and destructured methods stay bound.

```ts
const { birthday } = useStore.getState();
birthday(); // still works — `this` stays bound to the store or slice
```

Actions are bound at call time to the current state target, which is why destructuring does not drop `this`. Zustand intentionally avoids `this`, so the same derived/action code there usually goes through selectors or external helpers.

## Single-thread before / after

The same counter, written for both libraries.

```tsx
// Zustand: explicit selector + shallow equality + manual memo for derived value
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';

const useStore = create((set) => ({
  count: 0,
  step: 1,
  increment: () => set((s) => ({ count: s.count + s.step }))
}));

function Counter() {
  const { count, step } = useStore(
    useShallow((s) => ({ count: s.count, step: s.step }))
  );
  const doubled = useMemo(() => count * 2, [count]);
  return (
    <button onClick={() => useStore.getState().increment()}>
      {count} (step {step}) → {doubled}
    </button>
  );
}
```

```tsx
// Coaction: no selector, no useShallow, cached getter, `this` actions
import { create, observer } from '@coaction/react';

const useStore = create((set) => ({
  count: 0,
  step: 1,
  get doubled() {
    return this.count * 2;
  },
  increment() {
    set(() => {
      this.count += this.step;
    });
  }
}));

const Counter = observer(() => {
  const store = useStore();
  return (
    <button onClick={store.increment}>
      {store.count} (step {store.step}) → {store.doubled}
    </button>
  );
});
```

## Why "one cohesive model" actually matters

In Zustand you would typically reach the equivalent default experience by stacking independent packages:

```txt
Zustand
+ react-tracked              // automatic usage tracking (Proxy)
+ zustand-computed / getters // derived values
+ auto-selectors / zustand-x // selector boilerplate
+ immer (or mutative)        // ergonomic updates
```

Each of those is a separate mechanism: `react-tracked`'s render-time Proxy snapshot, a computed middleware's derived state, selector equality functions, and an immutable-update layer. They _combine_ into something similar, but no single dependency graph guarantees they stay consistent with each other.

Coaction's tracking and computed pieces share **one `alien-signals` graph**: a cached getter reading a field, a component reading that getter, and the field itself are connected, so invalidation is automatic and consistent end to end. That shared substrate — not "one package instead of four" — is the real structural advantage.

There is also a **supply-chain / maintenance** dimension the feature table hides: the stacked approach is four independently maintained packages with an N×N compatibility matrix across React and Zustand major versions. Coaction is a single version contract maintained as one unit.

## The honest costs

Cohesion has a price, and the pitch is more credible if it says so:

- **Bundle size.** Coaction's core depends on `alien-signals`, `data-transport`, and `mutative`, and the React binding also depends on `use-sync-external-store`. Current measurements are owned by two checked budget files: [`package-size-budgets.json`](../../scripts/package-size-budgets.json) gzips published entry files, while [`core-entry-size-budgets.json`](../../scripts/core-entry-size-budgets.json) builds tree-shaken `index`, `shared`, and `adapter` consumer fixtures. Neither is a dependency-inclusive application bundle. Local-only applications get the default `coaction` entry, which cannot reach the transport runtime; a real app will still include whichever external dependencies its bundler retains, while Zustand's core remains much smaller. Verify both boundaries with `pnpm build && pnpm package:size`.
- **A runtime model to learn.** Proxy/signal-backed state and the `observer()` convention are concepts Zustand's "thin, no-magic" core deliberately avoids. For teams that prize explicitness, that is a feature of Zustand, not a gap.
- **Tracking has a cost.** Explicit selectors can skip unrelated recipe updates, but collecting deep dependencies adds work. A full-array scan may benefit from `whole()` or a coarse cached getter more than per-element tracking. Measure the actual access pattern.
- **Maturity.** Zustand has a far larger ecosystem and battle-tested track record. Coaction's integrated model is younger.

## When Zustand is still the better choice

- you only need a small hook store with a few selectors
- bundle minimalism and a near-zero-dependency core are top priorities
- the team prefers explicit, magic-free subscriptions
- derived data is happy living in selectors or local memoization

## When Coaction's single-thread DX pays off

- selector-heavy components and repeated derived state
- you want derived values cached by default without `useMemo`/reselect
- you prefer `this`/getter ergonomics and mutable-style updates
- you would otherwise assemble `react-tracked` + a computed plugin + auto selectors and maintain that stack yourself

For the broader feature-by-feature comparison, see [Coaction vs Zustand](./zustand.md). For moving an existing codebase, see [Migrating from Zustand](../migration/from-zustand.md).
