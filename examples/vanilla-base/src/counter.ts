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

export function setupCounter(element: HTMLButtonElement) {
  const useStore = useWorkerStore;
  console.log('useStore.getState().counter', useStore.getState().count);
  useStore.subscribe(() => {
    element.innerHTML = `count is ${useStore.getState().count}`;
  });
  element.addEventListener('click', () => useStore.getState().increment());
  element.innerHTML = `count is ${useStore.getState().count}`;
}
