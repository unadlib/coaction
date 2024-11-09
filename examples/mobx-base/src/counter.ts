import { useStore } from './store';

const worker = new SharedWorker(new URL('./store.ts', import.meta.url), {
  type: 'module'
});

const useWorkerStore = useStore({
  worker
});

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
