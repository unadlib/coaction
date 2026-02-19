# @coaction/ng

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/ng.svg)](https://www.npmjs.com/package/@coaction/ng)
![license](https://img.shields.io/npm/l/@coaction/ng)

A Coaction integration tool for Angular.

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/ng
```

## Usage

```ts
import { create } from '@coaction/ng';

const store = create((set) => ({
  count: 0,
  increment() {
    set((draft) => {
      draft.count += 1;
    });
  }
}));

const count = store.select((state) => state.count);
console.log(count());
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
