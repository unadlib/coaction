# @coaction/react

![Node CI](https://github.com/coactionjs/coaction/workflows/Node%20CI/badge.svg) [![npm](https://img.shields.io/npm/v/@coaction/react.svg)](https://www.npmjs.com/package/@coaction/react) ![license](https://img.shields.io/npm/l/@coaction/react)

[English documentation](https://coactionjs.github.io/coaction/en/docs/) · [中文文档](https://coactionjs.github.io/coaction/zh/docs/)

A Coaction integration tool for React

## Installation

Install it with pnpm:

```sh
pnpm add coaction @coaction/react
```

## Compatibility

`@coaction/react` currently supports React 17, 18, and 19.

The package intentionally uses `use-sync-external-store/shim` internally so the same published build can work across those React versions. Removing the shim would require dropping React 17 support in a future major release.

The repository compiles and runs representative `observer()` and tracked-selector fixtures with the stable React Compiler Babel plugin (`pnpm test:react-compiler`). The CI fixture mounts the compiled components under React 19 and verifies both sibling-path isolation and tracked-path updates, so compiler compatibility is exercised behaviorally rather than inferred from React 19 runtime support alone.

## Usage

For local-only React stores, prefer the isolated entry so Worker/transport protocol code is not part of the consumer dependency graph:

```ts
import { create, observer } from '@coaction/react';
```

Use `@coaction/react/shared` when the store uses Coaction Worker/SharedWorker/custom transport features. The root `@coaction/react` entry remains backwards compatible and supports both modes.

```jsx
import { create, observer } from '@coaction/react';

const useStore = create((set) => ({
  count: 0,
  label: 'counter',
  increment: () => set((state) => state.count++)
}));

const CounterComponent = observer(() => {
  const store = useStore();
  return (
    <div>
      <p>Count: {store.count}</p>
      <button onClick={store.increment}>Increment</button>
    </div>
  );
});
```

Wrap components with `observer()` when you want MobX/Vue-style automatic render tracking. Inside an observed render, `useStore()` does not subscribe to the whole store; the component re-renders only when the Coaction state/getters it read during render change. Without `observer()`, `useStore()` remains a whole-store subscription.

Object traversal is collapsed to the deepest value actually read, so `state.user.profile.name` does not retain broad `user`/`profile` subscriptions. When a Coaction object is returned by a selector or passed directly as a React element prop, that object path is marked terminal and nested changes invalidate it. If object identity itself is used only as an opaque hook dependency inside `observer()` (for example `useMemo(..., [state.user])`) while deeper fields are also read, prefer an explicit selector for that object identity.

For smaller render regions, use `<Observer>`:

```tsx
import { Observer } from '@coaction/react';

const CounterValue = () => (
  <Observer>
    {() => {
      const store = useStore();
      return <span>{store.count}</span>;
    }}
  </Observer>
);
```

Explicit selectors use the same reactive path graph as `observer()`. After the selector commits, unrelated state paths do not rerun the selector; dynamic branches replace their dependency set on the next committed evaluation. Object-valued selector results subscribe to that terminal object path so nested changes still invalidate the selection.

If a selector reads an external/mutable adapter value that cannot establish a Coaction reactive-path dependency, the React adapter automatically falls back to the store subscription contract. This preserves compatibility without imposing whole-store selector reruns on normal immutable Coaction paths.

For selector-heavy components, `autoSelector` returns a cached selector map instead of values. Hook calls stay explicit:

```tsx
const selectors = useStore.auto();

const CounterComponent = () => {
  const count = useStore(selectors.count);
  const increment = useStore(selectors.increment);
  return <button onClick={increment}>Count: {count}</button>;
};
```

`useStore({ autoSelector: true })` is kept as an alias for `useStore.auto()`.

`autoSelector` is generated from the store shape known during initialization. If your application adds new keys at runtime, prefer explicit selectors such as `useStore((state) => state.dynamic[key])` for those paths instead of expecting the cached selector map to grow dynamically.

## Documentation

You can find the documentation [here](https://github.com/coactionjs/coaction).
