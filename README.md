# coaction

A sleek JavaScript library designed for high-performance and multiprocessing web apps.

## Installation

```bash
npm install coaction
```

## Usage

```ts
import { create } from 'coaction';

const useStore = create('counter', () => {
  count: 0,
  get countSquared() {
    return this.count ** 2;
  },
  increment() {
    this.count += 1;
  }
});
```

```tsx
import { useStore } from './store';

const worker = new Worker(new URL('./store.js', import.meta.url));
const useWorkerStore = useStore({
  name: 'WorkerCounter',
  worker
});

const CounterComponent = () => {
  const store = useStore();
  const workerStore = useWorkerStore();

  useEffect(
    () => useWorkerStore.subscribe(() => useWorkerStore.count, console.log),
    []
  );

  return (
    <div>
      <p>Count: {store.count}</p>
      <button onClick={store.increment}>Increment</button>
      <button onClick={store.decrement}>Decrement</button>

      <p>Count in Worker: {workerStore.count}</p>
      <button onClick={workerStore.increment}>Increment</button>
      <button onClick={workerStore.decrement}>Decrement</button>
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
