# @coaction/pinia

# Usage

```ts
import { defineStore, create } from '@coaction/pinia';

const useStore = create((set, get, api) =>
  defineStore('test', {
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
);
```
