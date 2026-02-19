# @coaction/jotai

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/jotai.svg)](https://www.npmjs.com/package/@coaction/jotai)
![license](https://img.shields.io/npm/l/@coaction/jotai)

A Coaction integration tool for Jotai.

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/jotai jotai
```

## Usage

```ts
import { create } from 'coaction';
import { adapt, atom, bindJotai, createStore } from '@coaction/jotai';

const countAtom = atom(0);
const jotaiStore = createStore();

const store = create(() =>
  adapt(
    bindJotai({
      store: jotaiStore,
      atoms: {
        count: countAtom
      },
      actions: ({ store, atoms }) => ({
        increment() {
          store.set(atoms.count, store.get(atoms.count) + 1);
        }
      })
    })
  )
);
```

## Limitations

- `@coaction/jotai` only supports binding a whole Jotai store.
- Coaction `Slices` mode is not supported in this adapter.

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
