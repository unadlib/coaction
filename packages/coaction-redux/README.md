# @coaction/redux

![Node CI](https://github.com/unadlib/coaction/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/@coaction/redux.svg)](https://www.npmjs.com/package/@coaction/redux)
![license](https://img.shields.io/npm/l/@coaction/redux)

A Coaction integration tool for Redux Toolkit.

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/redux @reduxjs/toolkit
```

## Usage

```ts
import { create } from 'coaction';
import {
  adapt,
  bindRedux,
  createSlice,
  configureStore,
  withCoactionReducer
} from '@coaction/redux';

const counterSlice = createSlice({
  name: 'counter',
  initialState: { count: 0 },
  reducers: {
    increment(state) {
      state.count += 1;
    }
  }
});

const reduxStore = configureStore({
  reducer: withCoactionReducer(counterSlice.reducer)
});

const store = create(() => adapt(bindRedux(reduxStore)));
store.getState().dispatch(counterSlice.actions.increment());
```

## Limitations

- `@coaction/redux` only supports binding a whole Redux store.
- Coaction `Slices` mode is not supported in this adapter.

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
