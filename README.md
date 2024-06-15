# coaction

A sleek JavaScript library designed for high-performance and multiprocessing web apps.

## Installation

```bash
npm install coaction
```

## Usage

```ts
import { createSlice } from 'coaction';

export const counterSlice = createSlice((store, set) => ({
  // state
  count: 0,
  // derived state
  get countSquared() {
    return this.count ** 2;
  },
  // actions
  increment() {
    set({ count: this.count + 1 });
  },
  // actions
  decrement() {
    set(() => (this.count -= 1));
  }
}));
```

```ts
import { createStore } from '@coaction/react';

export const useStore = useStore({
  counter: counterSlice
});
```

```tsx
import { useStore } from './store';

const worker = new Worker(new URL('./store.js', import.meta.url));

const CounterComponent = () => {
  const {
    counter: { count, increment, decrement }
  } = useStore(worker);

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
