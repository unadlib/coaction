import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';

import { useStore } from './store';

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
        <p>double: {double}</p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
