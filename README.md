# coaction

A sleek JavaScript library designed for high-performance and multiprocessing web apps.

## Installation

```bash
npm install coaction
```

## Usage

```ts
import { create } from "coaction";

const useCounterStore = create({
  name: "counter",
  count: 0,
  increment() {
    this.count += 1;
  },
  decrement() {
    this.count -= 1;
  },
});
```

```tsx
const CounterComponent = () => {
  const { count, increment, decrement } = useCounterStore();

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
