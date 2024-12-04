import { useStore } from './store';
import { createTransport } from 'data-transport';

const worker = new SharedWorker(new URL('./store.ts', import.meta.url), {
  type: 'module'
});

const useWorkerStore = useStore({
  transport: createTransport('SharedWorkerClient', {
    worker,
    verbose: true,
    prefix: useStore.name
  })
});

console.log('create');

globalThis.useWorkerStore = useWorkerStore;

globalThis.useStore = useStore;

export function setupCounter(element: HTMLButtonElement) {
  const useStore = useWorkerStore;
  useStore.subscribe(() => {
    element.innerHTML = `count is ${useStore.getState().counter.count}`;
  });
  element.addEventListener('click', () =>
    useStore.getState().counter.increment()
  );
  element.innerHTML = `count is ${useStore.getState().counter.count}`;
}
