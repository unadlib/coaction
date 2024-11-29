# coaction

## Usage

```ts
import { subscribe } from 'coaction';
import useStore from './counterStore';

const { increment, decrement } = useStore();

const worker = new Worker(new URL('./worker.js', import.meta.url));

const useWorkerStore = useStore(worker);
const { increment, decrement } = useWorkerStore();

document.getElementById('increment').addEventListener('click', increment);
document.getElementById('decrement').addEventListener('click', decrement);

useWorkerStore.subscribe(
  () => useWorkerStore.count,
  () => {
    document.getElementById('count').innerText = useWorkerStore.count;
  }
);
```
