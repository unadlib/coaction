# @coaction/react

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/react.svg)](https://www.npmjs.com/package/@coaction/react)
![license](https://img.shields.io/npm/l/@coaction/react)

A Coaction integration tool for React

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install @coaction/react
```

## Usage

```jsx
import { create } from '@coaction/react';

const useStore = create((set, get) => ({
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

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
