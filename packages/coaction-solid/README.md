# @coaction/solid

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/solid.svg)](https://www.npmjs.com/package/@coaction/solid)
![license](https://img.shields.io/npm/l/@coaction/solid)

A Coaction integration tool for Solid.

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/solid
```

## Usage

```tsx
import { create } from '@coaction/solid';

const store = create((set) => ({
  count: 0,
  increment() {
    set((draft) => {
      draft.count += 1;
    });
  }
}));

const count = store((state) => state.count);
console.log(count());
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
