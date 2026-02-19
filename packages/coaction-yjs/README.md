# @coaction/yjs

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/yjs.svg)](https://www.npmjs.com/package/@coaction/yjs)
![license](https://img.shields.io/npm/l/@coaction/yjs)

A Coaction integration tool for Yjs.

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/yjs
```

## Usage

```ts
import { create } from 'coaction';
import { yjs } from '@coaction/yjs';

const store = create(
  (set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }),
  {
    middlewares: [yjs()]
  }
);
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
