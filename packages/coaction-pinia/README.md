# @coaction/pinia

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/pinia.svg)](https://www.npmjs.com/package/@coaction/pinia)
![license](https://img.shields.io/npm/l/@coaction/pinia)

A Coaction integration tool for Pinia

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/pinia
```

## Usage

```js
import { create } from 'coaction';
import { bindPinia } from '@coaction/pinia';
import { defineStore } from 'pinia';

const useStore = create(() =>
  defineStore(
    'test',
    bindPinia({
      state: () => ({ count: 0 }),
      getters: {
        double: (state) => state.count * 2
      },
      actions: {
        increment(state) {
          state.count += 1;
        }
      }
    })
  )
);
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
