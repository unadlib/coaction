# @coaction/alien-signals

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/alien-signals.svg)](https://www.npmjs.com/package/@coaction/alien-signals)
![license](https://img.shields.io/npm/l/@coaction/alien-signals)

A Coaction integration tool for alien-signals.

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/alien-signals alien-signals
```

## Usage

```ts
import { create } from '@coaction/alien-signals';

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
