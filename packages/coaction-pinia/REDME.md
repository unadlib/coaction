# @coaction/pinia

# Usage

```ts
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
