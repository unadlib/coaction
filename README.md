# coaction

A sleek JavaScript library designed for high-performance and multiprocessing web apps.

## Installation

```bash
npm install coaction
```

## Usage

```ts
import { create } from 'coaction';

export const useStore = create({
  count: 0,
  get countSquared() {
    return this.count ** 2;
  },
  increment() {
    this.count += 1;
  },
  todo: create({
    items: [],
    add(item) {
      this.items.push(item);
    }
  }),
  bear: create((set, root) => ({
    bears: 0,
    addBear() {
      set(() => {
        this.bears++;
      });
    },
    increment() {
      set(() => {
        root.count++;
      });
    },
    get bearCount() {
      return this.bears;
    },
    async fetch(id: string) {
      const response = await fetch(id);
      const bears = (await response.json()) as number;
      set({ bears });
    }
  }))
});
```

```tsx
import { useStore } from './store';

const worker = new Worker(new URL('./store.js', import.meta.url));
const useWorkerStore = useStore(worker);

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
