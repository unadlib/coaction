# coaction

A sleek JavaScript library designed for high-performance and multiprocessing web apps.

## Installation

```bash
npm install coaction
```

### Coaction Features

- Cross-Framework Compatibility: Seamlessly works with React, Vue, Solid.js, Angular, and other modern web frameworks
- Multi-threaded State Management: Effortlessly manage state across main thread and Web Workers
- Intuitive API Design: Simple and expressive API inspired by popular state management libraries
- Flexible Store Creation: Create multiple stores with unique names for better organization
- Worker Integration: Easy integration with Web Workers and Shared Worker for offloading computations
- Computed Properties: Support for derived state through getter functions
- Slices Pattern: Easily combine multiple slices into a single store using `combineSlices()`
- Namespace Support: Avoid key conflicts with namespaced slices
- Performance Optimized: Efficient state updates and retrieval, even with deeply nested structures
- Type-Safe: Full TypeScript support for enhanced developer experience
- Middleware Support: Supports state subscriptions and middleware for side effects and enhanced state handling
- Cross-Store Access: Read states and call functions across different stores while preventing unintended modifications
- Multi-Store Workers: Run multiple stores within a single Web Worker
- Shared Stores Across Workers: Use the same store definition across multiple Workers
- Reactive: Built-in subscription mechanism for efficient UI updates
- Async Action Support: Easily handle asynchronous state updates
- Multi-Transport Support: Use generic transports for state synchronization
- Immutable Updates: Ensures predictable state changes with immutable update patterns
- Developer Tools Integration: Easy debugging with integrated developer tools
- Persistence: Built-in support for state persistence
- Scalable Architecture: Designed to scale from simple apps to complex, multi-threaded applications

## Usage

### Basic Usage

```ts
import { create } from 'coaction';

const useStore = create({
  name: 'counter',
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

### Slices Pattern

```ts
import { create, combineSlices } from 'coaction';

const counterSlices = {
  name: 'counter',
  count: 0,
  get countSquared() {
    return this.count ** 2;
  },
  increment() {
    this.count += 1;
  }
};

const counter1Slices = {
  name: 'counter1',
  count: 0,
  get countSquared() {
    return this.count ** 2;
  },
  increment() {
    this.count += 1;
  }
};

const useStore = create(
  combineSlices({
    counter: counterSlices,
    counter1: counter1Slices
  })
);
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
