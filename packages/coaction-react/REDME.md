# @coaction/react

# Usage

### Slices Pattern

```ts
import { create } from '@coaction/react';

const counterSlices = (set) => ({
  name: 'counter',
  count: 0,
  get countSquared() {
    return this.count ** 2;
  },
  increment() {
    set(() => (this.count += 1));
  }
});

const counter1Slices = (set) => ({
  name: 'counter1',
  count: 0,
  get countSquared() {
    return this.count ** 2;
  },
  increment() {
    set(() => (this.count += 1));
  }
});

const useStore = create({
  counter: counterSlices,
  counter1: counter1Slices
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
  const { counter: store } = useStore();
  const { counter: workerStore } = useWorkerStore();

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
