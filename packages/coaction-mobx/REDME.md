# @coaction/mobx

# Usage

```ts
import { defineStore, create } from '@coaction/mobx';

const useStore = create((set, get, api) =>
  makeAutoObservable({
    name: 'test',
    count: 0,
    get double() {
      return this.count * 2;
    },
    increment() {
      this.count += 1;
    }
  })
);
```
