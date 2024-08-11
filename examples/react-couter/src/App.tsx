import { useEffect } from 'react';
import './App.css';
import { useStore } from './counterStore';

const worker = new Worker(new URL('./store.js', import.meta.url));
const useWorkerStore = useStore({
  name: 'WorkerCounter',
  worker
});

function App() {
  const store = useStore();
  const workerStore = useWorkerStore();

  useEffect(
    () => useWorkerStore.subscribe(() => useWorkerStore.count, console.log),
    []
  );

  return (
    <div>
      <p>Count: {store.count}</p>
      <button onClick={store.increment}>Increment</button>
      <button onClick={store.decrement}>Decrement</button>

      <p>Count in Worker: {workerStore.count}</p>
      <button onClick={workerStore.increment}>Increment</button>
      <button onClick={workerStore.decrement}>Decrement</button>
    </div>
  );
}

export default App;
