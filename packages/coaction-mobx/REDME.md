# @coaction/mobx

# Usage

```ts
import { create, name } from '@coaction/mobx';
import { makeAutoObservable } from 'mobx';

const useStore = create((set, get, api) =>
  makeAutoObservable(
    bind({
      name: 'test',
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
