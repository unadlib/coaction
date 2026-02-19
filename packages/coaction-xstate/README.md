# @coaction/xstate

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/xstate.svg)](https://www.npmjs.com/package/@coaction/xstate)
![license](https://img.shields.io/npm/l/@coaction/xstate)

A Coaction integration tool for XState.

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/xstate xstate
```

## Usage

```ts
import { create } from 'coaction';
import {
  adapt,
  assign,
  bindXState,
  createActor,
  createMachine
} from '@coaction/xstate';

const machine = createMachine({
  context: {
    count: 0
  },
  on: {
    increment: {
      actions: assign({
        count: ({ context }) => context.count + 1
      })
    }
  }
});

const actor = createActor(machine);
actor.start();

const store = create(() => adapt(bindXState(actor)));
store.getState().send({ type: 'increment' });
```

## Limitations

- `@coaction/xstate` only supports binding a whole XState actor.
- Coaction `Slices` mode is not supported in this adapter.
- `setState()` is blocked; update state through actor events.

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
