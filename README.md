# Coaction

<a href="https://github.com/unadlib/coaction" target="_blank"><img src="./logo.png" height="120" alt="Coaction Logo" /></a>

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/unadlib/coaction/badge.svg?branch=main)](https://coveralls.io/github/unadlib/coaction?branch=main)
[![npm](https://img.shields.io/npm/v/coaction.svg)](https://www.npmjs.com/package/coaction)
[![NPM Downloads](https://img.shields.io/npm/dm/coaction)](https://npmtrends.com/coaction)
![license](https://img.shields.io/npm/l/coaction)

An efficient and flexible state management library for building high-performance, multithreading web applications.

## Motivation

Modern web applications are becoming increasingly complex, pushing the boundaries of what's possible in the browser. Single-threaded JavaScript, while powerful, often struggles to keep up with the demands of sophisticated UIs, real-time interactions, and data-intensive computations. This bottleneck leads to performance issues, laggy or unresponsive interfaces, limitations in request connections, and ultimately, a compromised user experience.

While Web Workers (or SharedWorker) offer a path towards parallelism and improved performance, they introduce a new set of challenges. Managing state across threads, synchronizing data efficiently, and maintaining coherent application logic can quickly become a daunting task. Existing state management solutions often fall short in addressing these specific needs, either by being too tightly coupled to the worker thread or by introducing complex abstractions that hinder developer productivity.

![Coaction Concept](./coaction-concept.svg)

**`Coaction` was created out of the need for a state management solution that truly embraces the multithreading nature of modern web applications.** It recognizes that performance and developer experience shouldn't be mutually exclusive. By leveraging the power of Web Workers and Shared Workers, `Coaction` allows developers to offload computationally intensive tasks and state management logic from the worker thread, resulting in a more responsive and fluid user interface.

**More than just performance, `Coaction` is about enabling a more scalable and maintainable architecture for complex applications.** The library's intuitive API, inspired by Zustand, ensures a smooth learning curve and a productive development workflow. Its support for Slices, namespaces, and computed properties promotes modularity and code organization, making it easier to manage large and evolving codebases.

**`Coaction`'s integration with `data-transport` unlocks a new level of flexibility in state synchronization.** By supporting generic transport protocols, it opens up possibilities for various communication patterns and architectures, catering to the unique needs of different applications.

**In essence, `Coaction` empowers developers to build the next generation of web applications without sacrificing performance, developer experience, or architectural integrity.** It bridges the gap between the increasing complexity of web applications and the need for efficient, maintainable, and performant state management across threads. It's a tool designed for developers who strive to create exceptional user experiences in a world where parallelism and responsiveness are no longer optional, but essential. It also supports remote synchronization, making it suitable for building any CRDTs application as well.

## Concepts and Features

`Coaction` aims to provide a secure and efficient solution for sharing and synchronizing state in multithreading environments (such as Web Workers, Shared Workers, or even across processes and devices) in web applications.

Key features include:

- **Multithreading Sync**: Supports sharing state between webpage thread and the worker thread. With `data-transport` for generic communication, developers can avoid the complexities of message passing and serialization logic.
- **Immutable State with Optional Mutability**: Powered by the [Mutative](https://github.com/unadlib/mutative) library, the core provides an immutable state transition process while allowing performance optimization with mutable instances when needed.
- **Patch-Based Updates**: Enables efficient incremental state changes through patch-based synchronization, simplifying its use in CRDTs applications.
- **Built-in Computed**: Supports derived properties based on state dependencies, making it easier to manage and retrieve computed data from core states.
- **Slices Pattern**: Easily combine multiple slices into a store with namespace.
- **Extensible Middleware**: Allows for middleware to enhance the store's behavior, such as logging, time-travel debugging, or integration with third-party tools.
- **Integration with 3rd-Party Libraries**: Supports popular frameworks like React, Angular, Vue, Svelte, and Solid, as well as state management libraries such as Redux, Zustand, and MobX.

## Operating Modes and Fundamentals

This library operates in two primary modes:

- Standard Mode
  - In a standard webpage environment, the store is managed entirely within the webpage thread. Patch updates are disabled by default to ensure optimal performance in standard mode.
- Shared Mode
  - The worker thread serves as the primary source of the shared state, utilizing transport for synchronization.
  - Webpage thread act as clients, accessing and manipulating the state asynchronously through a store.

In shared mode, the library automatically determines the execution context based on the transport parameters, handling the synchronization thread seamlessly.

You can easily use `Coaction` in your application to support multiple tabs, multithreading, or multiprocessing.

For example, for a [3D scene](./examples/3d-scene/src/windowsManager.ts) shared across several tabs, you can effortlessly handle their state management using `Coaction`.

https://github.com/user-attachments/assets/9eb9f4f8-8d47-433a-8eb2-85f044d6d8fa

### Shared Mode - Sequence Diagram

```mermaid
sequenceDiagram
    participant Client as Webpage Thread (Client)
    participant Main as Worker Thread (Main)

    activate Client
    Note over Client: Start Worker Thread
    activate Main

    Client ->> Main: Trigger fullSync event after startup
    activate Main
    Main -->> Client: Synchronize data (full state)
    deactivate Main

    Note over Client: User triggers a UI event
    Client ->> Main: Send Store method and parameters
    activate Main
    Main ->> Main: Execute the corresponding method
    Main -->> Client: Synchronize state (patches)
    Note over Client: Render new state

    Main -->> Client: Asynchronously respond with method execution result
    deactivate Main
    deactivate Client
```

## Performance

![Benchmark](benchmark.jpg)

Measure(ops/sec) to update 10K arrays, bigger is better([view source](https://github.com/unadlib/mutative/blob/main/test/performance/benchmark.ts)).

| Library        | Test Name                       | Ops/sec |
| -------------- | ------------------------------- | ------- |
| @coaction/mobx | bigInitWithoutRefsWithoutAssign | 37.07   |
| mobx           | bigInitWithoutRefsWithoutAssign | 37.50   |
| **coaction**   | bigInitWithoutRefsWithoutAssign | 19,910  |
| mobx-keystone  | bigInitWithoutRefsWithoutAssign | 7.88    |
| @coaction/mobx | bigInitWithoutRefsWithAssign    | 1.53    |
| mobx           | bigInitWithoutRefsWithAssign    | 10.77   |
| **coaction**   | bigInitWithoutRefsWithAssign    | 3.01    |
| mobx-keystone  | bigInitWithoutRefsWithAssign    | 0.13    |
| @coaction/mobx | bigInitWithRefsWithoutAssign    | 14.66   |
| mobx           | bigInitWithRefsWithoutAssign    | 16.11   |
| **coaction**   | bigInitWithRefsWithoutAssign    | 152     |
| mobx-keystone  | bigInitWithRefsWithoutAssign    | 2.44    |
| @coaction/mobx | bigInitWithRefsWithAssign       | 0.98    |
| mobx           | bigInitWithRefsWithAssign       | 8.81    |
| **coaction**   | bigInitWithRefsWithAssign       | 3.83    |
| mobx-keystone  | bigInitWithRefsWithAssign       | 0.11    |
| @coaction/mobx | init                            | 37.34   |
| mobx           | init                            | 42.98   |
| **coaction**   | init                            | 3,524   |
| mobx-keystone  | init                            | 40.48   |

This table benchmarks various state management libraries on large initialization tasks. Coaction stands out dramatically, performing at least hundreds of times faster in certain scenarios. For example, in the "bigInitWithoutRefsWithoutAssign" test, Coaction achieves about 19,910 ops/sec compared to Mobx’s 37.5 ops/sec—over 500 times faster. Similarly, in the "init" test, Coaction reaches around 3,524 ops/sec versus Mobx's 42.98 ops/sec—an increase of roughly 80 times. These results highlight Coaction's exceptional efficiency in handling large-scale data initialization.

> We will also provide more complete benchmarking.

## Installation

You can install `@coaction/react` for React application via npm, yarn, or pnpm.

```bash
npm install coaction @coaction/react
```

If you want to use the core library without any framework, you can install `coaction` via npm, yarn, or pnpm.

```bash
npm install coaction
```

## Usage

### Standard Mode Store

```jsx
import { create } from '@coaction/react';

const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => state.count++)
}));

const CounterComponent = () => {
  const store = useStore();
  return (
    <div>
      <p>Count: {store.count}</p>
      <button onClick={store.increment}>Increment</button>
    </div>
  );
};
```

### Shared Mode Store

`counter.js`:

```js
export const counter = (set) => ({
  count: 0,
  increment: () => set((state) => state.count++)
});
```

`worker.js`:

```js
import { create } from '@coaction/react';
import { counter } from './counter';

create(counter);
```

```jsx
import { create } from '@coaction/react';
import { counter } from './counter';

const worker = new Worker(new URL('./worker.js', import.meta.url), {
  type: 'module'
});
const useStore = create(counter, { worker });

const CounterComponent = () => {
  const store = useStore();
  return (
    <div>
      <p>Count in Worker: {store.count}</p>
      <button onClick={() => store.increment()}>Increment</button>
    </div>
  );
};
```

### Slices Pattern And Derived Data

```jsx
import { create } from '@coaction/react';

const counter = (set, get) => ({
  count: 0,
  // derived data without cache
  get tripleCount() {
    return this.count * 3;
  },
  // derived data with cache
  doubleCount: get(
    (state) => [state.counter.count],
    (count) => count * 2
  ),
  increment() {
    set(() => {
      // you can use `this` to access the slice state
      this.count += 1;
    });
  }
});

const useStore = create({
  counter
});
```

## Integration

Coaction is designed to be compatible with a wide range of libraries and frameworks.

### Supported Libraries and Frameworks

|         | Package          | Status  |
| ------- | ---------------- | ------- |
| React   | @coaction/react  | ✅ Done |
| Vue     | @coaction/vue    | Ongoing |
| Angular | @coaction/ng     |         |
| Svelte  | @coaction/svelte |         |
| Solid   | @coaction/solid  |         |
| Yjs     | @coaction/yjs    |         |

### State Management Libraries

|               | Package           | Status  |
| ------------- | ----------------- | ------- |
| MobX          | @coaction/mobx    | ✅ Done |
| Pinia         | @coaction/pinia   | ✅ Done |
| Zustand       | @coaction/zustand | Ongoing |
| Redux Toolkit | @coaction/redux   |         |
| Jotai         | @coaction/jotai   |         |
| XState        | @coaction/xstate  |         |
| Valtio        | @coaction/valtio  |         |
| alien-signals | @coaction/alien   | Ongoing |

## Middlewares

|           | Package           | Status  |
| --------- | ----------------- | ------- |
| Logger    | @coaction/logger  | ✅ Done |
| Persist   | @coaction/persist | Ongoing |
| Undo/Redo | @coaction/history | Ongoing |

## Difference between Coaction and Zustand

|                                   | `coaction` | Zustand |
| --------------------------------- | ---------- | ------- |
| Built-in multithreading           | ✅         | ❌      |
| Support getter accessor           | ✅         | ❌      |
| Built-in computed properties      | ✅         | ❌      |
| Built-in namespace Slice          | ✅         | ❌      |
| Built-in auto selector for state  | ✅         | ❌      |
| Built-in multiple stores selector | ✅         | ❌      |
| Easy to implement middleware      | ✅         | ❌      |
| Support `this` in getter/action   | ✅         | ❌      |

## Credits

- Coaction's concept is inspired by [Partytown](https://partytown.qwik.dev/).
- Coaction's API is inspired by [Zustand](https://zustand.docs.pmnd.rs/).

## License

`Coaction` is [MIT licensed](./LICENSE).
