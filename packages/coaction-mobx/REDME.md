# @coaction/mobx

## Usage

```ts
import { create } from 'coaction';
import { bindMobx } from '@coaction/mobx';
import { makeAutoObservable } from 'mobx';

const useStore = create(() =>
  makeAutoObservable(
    bindMobx({
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
