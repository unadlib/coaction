# @coaction/vue

## Usage

```vue
<template>
  <div>
    <p>Count: {{ count }}</p>
    <button @click="increment">Increment</button>
    <button @click="decrement">Decrement</button>
  </div>
</template>

<script>
import { useStore } from '@coaction/vue';
import counterStore from './counterStore';

const worker = new Worker(new URL('./worker.js', import.meta.url));

export default {
  setup() {
    const { count, increment, decrement } = useStore(counterStore, worker);

    return {
      count,
      increment,
      decrement
    };
  }
};
</script>
```
