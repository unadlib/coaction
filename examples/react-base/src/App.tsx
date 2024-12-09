import { useState } from 'react';
import { create, Slices } from '@coaction/react';
import { logger } from '@coaction/logger';

import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';
import { counter, Counter } from './store';

const worker = new SharedWorker(new URL('./worker.ts', import.meta.url), {
  type: 'module'
});

export const useStore = create<{
  counter: Counter;
}>(
  {
    counter
  },
  {
    middlewares: [
      logger({
        collapsed: false
      })
    ],
    worker
  }
);

globalThis.useStore = useStore;

function App() {
  const count = useStore((state) => state.counter.count);
  const double = useStore((state) => state.counter.double);
  const increment = useStore((state) => state.counter.increment);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => increment()}>count is {count}</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
