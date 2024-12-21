# @coaction/mobx

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/mobx.svg)](https://www.npmjs.com/package/@coaction/mobx)
![license](https://img.shields.io/npm/l/@coaction/mobx)

A Coaction integration tool for MobX

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/mobx
```

## Usage

```js
import { create } from 'coaction';
import { bindMobx } from '@coaction/mobx';
import { makeAutoObservable } from 'mobx';

const useStore = create(() =>
  makeAutoObservable(
    bindMobx({
      count: 0,
      get double() {
        return this.count * 2;
      },
      increment() {
        this.count += 1;
      }
    })
  )
);
```

### setState()

- It is recommended to update state through store methods, instead of directly updating the state.
- Any direct mutations to the state outside of methods should be wrapped in setState()

```js
// ❌ it will not be triggered state update
store.getState().counter.count += 1;

// ✅ it will be triggered state update
store.setState(() => {
  store.getState().counter.count += 1;
});
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
