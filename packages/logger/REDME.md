# @coaction/logger

A logger middleware for coaction.

## Usage

```ts
import { create } from 'coaction';
import { logger } from '@coaction/logger';

const useStore = create(
  (set) => ({
    count: 0,
    get countSquared() {
      return this.count ** 2;
    },
    increment() {
      set(() => {
        this.count += 1;
      });
    }
  }),
  {
    middleware: [logger()]
  }
);
```

## TODO

- [x] support verbose mode
- [ ] support custom transformer
