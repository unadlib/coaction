# @coaction/logger

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/logger.svg)](https://www.npmjs.com/package/@coaction/logger)
![license](https://img.shields.io/npm/l/@coaction/logger)

A logger middleware for Coaction.

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install @coaction/logger
```

## Usage

```js
import { create } from 'coaction';
import { logger } from '@coaction/logger';

const useStore = create(
  (set) => ({
    count: 0,
    get countSquared() {
      return this.count ** 2;
    },
    increment() {
      set(() => {
        this.count += 1;
      });
    }
  }),
  {
    middleware: [logger()]
  }
);
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
