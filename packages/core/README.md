# coaction

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/coaction.svg)](https://www.npmjs.com/package/coaction)
![license](https://img.shields.io/npm/l/coaction)

An efficient and flexible state management library for building high-performance, multithreading web applications.

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction
```

## Usage

```jsx
import { create } from 'coaction';

const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => state.count++)
}));
```

Store methods using `this` are rebound to the latest state when invoked from
`getState()`, so destructuring remains safe:

```ts
const store = create((set) => ({
  count: 0,
  increment() {
    set(() => {
      this.count += 1;
    });
  }
}));

const { increment } = store.getState();
increment();
```

## API Reference

- [Generated core API index](../../docs/api/core/index.md)
- [Core API notes](../../docs/api/core/documents/core-api-notes.md)

### Store Shape Mode (`sliceMode`)

`create()` uses `sliceMode: 'auto'` by default. For backward compatibility,
`auto` still treats a non-empty object whose enumerable values are all
functions as slices. That shape is ambiguous with a plain store that only
contains methods, so development builds warn and you should set `sliceMode`
explicitly.

You can force behavior explicitly:

- `sliceMode: 'single'`: treat object input as a single store.
- `sliceMode: 'slices'`: require object-of-slice-functions input.

```ts
create({ ping: () => 'pong' }, { sliceMode: 'single' });
create({ counter: (set) => ({ count: 0 }) }, { sliceMode: 'slices' });
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
