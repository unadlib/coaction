# coaction

# Usage

```ts
import { useStore, subscribe } from 'coaction';
import counterStore from './counterStore';

const worker = new Worker(new URL("./worker.js", import.meta.url));

const { increment, decrement } = useStore(counterStore, worker);

document.getElementById('increment').addEventListener('click', increment);
document.getElementById('decrement').addEventListener('click', decrement);

subscribe(counterStore, ({ count }) => {
  document.getElementById('count').innerText = count;
});
```