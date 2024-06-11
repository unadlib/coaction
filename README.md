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
  // store name
  name: "counter",
  // state
  count: 0,
  // derived state
  get countSquared() {
    return this.count ** 2;
  },
  // actions
  increment() {
    this.count += 1;
  },
  // actions
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

- Redux Toolkit
- Zustand
- MobX
- Jotai
- Recoil
- XState
- Pinia

## Runner

- Web Workers
- Shared Workers
