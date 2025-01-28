# @coaction/vue

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/vue.svg)](https://www.npmjs.com/package/@coaction/vue)
![license](https://img.shields.io/npm/l/@coaction/vue)

A Coaction integration tool for Vue

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/vue
```

## Usage

```jsx
import { create } from 'coaction';
import { bindVue } from '@coaction/vue';

const useStore = create((set) =>
  bindVue((set) => ({
    count: 0,
    increment: () => set((state) => state.count++)
  }))
);
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
