# @coaction/alien-signals

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/alien-signals.svg)](https://www.npmjs.com/package/@coaction/alien-signals)
![license](https://img.shields.io/npm/l/@coaction/alien-signals)

A Coaction integration tool for alien-signals

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/alien-signals
```

## Usage

```jsx
import { create } from '@coaction/alien-signals';

const useStore = create((set) => ({
  count: 0,
  get double() {
    return this.count * 2;
  },
  increment: () => set((state) => state.count++)
}));
```
