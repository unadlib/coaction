import { useStore } from './store';

// @ts-ignore
// const { increment } = useStore();

const worker = new SharedWorker(new URL('./store.ts', import.meta.url), {
  type: 'module'
});

const useWorkerStore = useStore({
  worker
});

console.log('create');

globalThis.useWorkerStore = useWorkerStore;

export function setupCounter(element: HTMLButtonElement) {
  const useStore = useWorkerStore;
  useStore.subscribe(() => {
    element.innerHTML = `count is ${useStore.getState().count}`;
  });
  element.addEventListener('click', () => useStore.getState().increment());
  element.innerHTML = `count is ${useStore.getState().count}`;
}
