# @coaction/svelte

## Usage

```svelte
<script>
  import { useStore } from '@coaction/svelte';
  import counterStore from './counterStore';

  const worker = new Worker(new URL("./worker.js", import.meta.url));
  const { count, increment, decrement } = useStore(counterStore, worker);
</script>

<p>Count: {count}</p>
<button on:click={increment}>Increment</button>
<button on:click={decrement}>Decrement</button>
```
