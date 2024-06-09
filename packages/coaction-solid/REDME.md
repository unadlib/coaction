# @coaction/solid

# Usage

```tsx
import { useStore } from "@coaction/solid";
import counterStore from "./counterStore";

const worker = new Worker(new URL("./worker.js", import.meta.url));

const CounterComponent = () => {
  const { count, increment, decrement } = useStore(counterStore, worker);
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={increment}>Increment</button>
      <button onClick={decrement}>Decrement</button>
    </div>
  );
};
```
