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

### Store Shape Mode (`sliceMode`)

`create()` uses `sliceMode: 'auto'` by default. You can force behavior explicitly:

- `sliceMode: 'single'`: treat object input as a single store.
- `sliceMode: 'slices'`: require object-of-slice-functions input.

```ts
create({ ping: () => 'pong' }, { sliceMode: 'single' });
create({ counter: (set) => ({ count: 0 }) }, { sliceMode: 'slices' });
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
