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
import { create } from '@coaction/vue';

const useStore = create((set) => ({
  count: 0,
  increment() {
    set((draft) => {
      draft.count += 1;
    });
  }
}));

export default {
  setup() {
    const state = useStore();
    const count = useStore((current) => current.count);
    return {
      state,
      count
    };
  }
};
```

Use `autoSelector` to receive computed refs for each field:

```tsx
const selectors = useStore({ autoSelector: true });
selectors.increment();
console.log(selectors.count.value);
```

## Documentation

You can find the documentation [here](https://github.com/unadlib/coaction).
