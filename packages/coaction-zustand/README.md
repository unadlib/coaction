# @coaction/zustand

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/zustand.svg)](https://www.npmjs.com/package/@coaction/zustand)
![license](https://img.shields.io/npm/l/@coaction/zustand)

A Coaction integration tool for Zustand

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/zustand
```

## Usage

```jsx
import { create } from 'coaction';
import { bindZustand } from '@coaction/zustand';
import { create as createWithZustand } from 'zustand';

const useStore = create(() =>
  createWithZustand(
    bindZustand((set) => ({
      count: 1,
      inc: () => set((state) => ({ count: state.count + 1 }))
    }))
  )
);
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
