# @coaction/svelte

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/svelte.svg)](https://www.npmjs.com/package/@coaction/svelte)
![license](https://img.shields.io/npm/l/@coaction/svelte)

A Coaction integration tool for Svelte.

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/svelte
```

## Usage

```ts
import { create } from '@coaction/svelte';

const store = create((set) => ({
  count: 0,
  increment() {
    set((draft) => {
      draft.count += 1;
    });
  }
}));

const count = store((state) => state.count);
count.subscribe((value) => {
  console.log(value);
});
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
