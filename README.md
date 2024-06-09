# coaction

A sleek JavaScript library designed for high-performance and multiprocessing web apps.

## Installation

```bash
npm install coaction
```

## Usage

```ts
import { create } from "coaction";

const counterStore = create({
  name: "counter",
  count: 0,
  get countSquared() {
    return this.count ** 2;
  },
  increment() {
    this.count += 1;
  },
  decrement() {
    this.count -= 1;
  },
});
```

```tsx
import { useStore } from "@coaction/react";

const worker = new Worker(new URL("./worker.js", import.meta.url));

const CounterComponent = () => {
  const { count, increment, decrement } = useStore(counterStore, worker);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={increment}>Increment</button>
      <button onClick={decrement}>Decrement</button>
    </div>
  );
};
```

### Supported Libraries and Frameworks

- React
- Angular
- Vue
- Svelte
- Solid

### State Management

- Redux
- MobX
- Jotai
- Zustand
- Recoil
- XState
- Vuex
- Pinia

## Runner

- Web Workers
- Service Workers
- Shared Workers
