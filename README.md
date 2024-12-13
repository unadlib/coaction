# coaction

A sleek JavaScript library designed for building high-performance, multiprocessing web applications.

## Concepts and Features

This library aims to provide a secure and efficient solution for sharing and synchronizing state in multi-process environments (such as Web Workers, Shared Workers, or even across processes and devices) in web applications.

Key features include:

- Multiprocessing Sync: Supports sharing state between webpage processes and the main process. With `data-transport` for generic communication, developers can avoid the complexities of message passing and serialization logic.
- Immutable State with Optional Mutability: Powered by the `mutative` library, the core provides an immutable state transition process while allowing performance optimization with mutable instances when needed.
- Patch-Based Updates: Enables efficient incremental state changes through patch-based synchronization, simplifying its use in CRDT applications.
- Built-in Computed Data: Supports derived properties based on state dependencies, making it easier to manage and retrieve computed data from core states.
- Slices Pattern: Easily combine multiple slices into a store.
- Extensible Middleware: Allows for middleware to enhance the store’s behavior, such as logging, time-travel debugging, or integration with third-party tools.
- Integration with 3rd-Party Libraries: Supports popular frameworks like React, Angular, Vue, Svelte, and Solid, as well as state management libraries such as Redux, Zustand, and MobX.

## Operating Modes and Fundamentals

This library operates in two primary modes:

1. Single-Process Local Mode: In a standard webpage environment, the store is managed entirely within the webpage process.
2. Multi-Process Shared Mode:
   - The main process serves as the primary source of the shared state, utilizing transport for synchronization.
   - Webpage processes act as clients, accessing and manipulating the state asynchronously through a store.

In multi-process mode, the library automatically determines the execution context based on the transport parameters, handling the synchronization processes seamlessly.

## Installation

You can install the library via npm, yarn, or pnpm.

```bash
npm install @coaction/react
# or
yarn add @coaction/react
# or
pnpm add @coaction/react
```

If you want to use the core library without any framework, you can install it via npm, yarn, or pnpm.

```bash
npm install coaction
# or
yarn add coaction
# or
pnpm add coaction
```

## Usage

### Basic Usage

#### Base Store

```jsx
import { create } from '@coaction/react';

const useStore = create((set, get) => ({
  count: 0,
  doubleCount: computed(
    (state) => [state.count],
    () => get().count * 2
  ),
  increment() {
    set(() => {
      this.count += 1;
    });
  }
}));

const CounterComponent = () => {
  const store = useStore();
  return (
    <div>
      <p>Count: {store.count}</p>
      <button onClick={store.increment}>Increment</button>
      <button onClick={store.decrement}>Decrement</button>
    </div>
  );
};
```

#### Worker Store

`store.js`:

```ts
import { create } from 'coaction';

const useStore = create((set) => ({
  name: 'counter',
  count: 0,
  get countSquared() {
    return this.count ** 2;
  },
  increment() {
    set(() => {
      this.count += 1;
    });
  }
}));
```

```tsx
const worker = new Worker(new URL('./store.js', import.meta.url));
const useWorkerStore = useStore({
  name: 'WorkerCounter',
  worker
});

const CounterComponent = () => {
  const workerStore = useWorkerStore();
  return (
    <div>
      <p>Count in Worker: {workerStore.count}</p>
      <button onClick={workerStore.increment}>Increment</button>
      <button onClick={workerStore.decrement}>Decrement</button>
    </div>
  );
};
```

### Slices Pattern

```jsx
import { create } from '@coaction/react';

const counter = (set) => ({
  count: 0,
  increment() {
    set(() => {
      this.count += 1;
    });
  }
});

const useStore = create({
  counter
});

const CounterComponent = () => {
  const count = useStore((state) => state.counter.count);
  const increment = useStore((state) => state.counter.increment);
  const decrement = useStore((state) => state.counter.decrement);
  return (
    <div>
      <p>Count in Worker: {count}</p>
      <button onClick={increment}>Increment</button>
      <button onClick={decrement}>Decrement</button>
    </div>
  );
};
```

## Integration

Coaction is designed to be compatible with a wide range of libraries and frameworks.

### Supported Libraries and Frameworks

- [x] React
- [ ] Vue
- [ ] Angular
- [ ] Svelte
- [ ] Solid

### State Management Libraries

- [x] MobX
- [x] Pinia
- [ ] Redux Toolkit
- [ ] Zustand
- [ ] Jotai
- [ ] XState
- [ ] Valtio

## Credits

Coaction API is inspired by [Zustand](https://zustand.docs.pmnd.rs/).

## License

`Coaction` is [MIT licensed](./LICENSE).
