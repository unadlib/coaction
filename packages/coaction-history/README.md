# @coaction/history

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/history.svg)](https://www.npmjs.com/package/@coaction/history)
![license](https://img.shields.io/npm/l/@coaction/history)

A undo/redo middleware for Coaction.

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/history
```

## Usage

```ts
import { create } from 'coaction';
import { history } from '@coaction/history';

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
    middlewares: [history()]
  }
);

store.getState().increment();
(store as any).history.undo();
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
