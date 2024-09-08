import { create } from 'coaction';
import { useStore } from './store';

// @ts-ignore
const { increment } = useStore();

// const worker = new Worker(new URL('./store.ts', import.meta.url), { type: 'module' });

// const useWorkerStore = useStore(worker);
// const { increment } = useWorkerStore();

// document.getElementById('increment').addEventListener('click', increment);
// document.getElementById('decrement').addEventListener('click', decrement);

// useWorkerStore.subscribe(
//   () => useWorkerStore.count,
//   () => {
//     document.getElementById('count').innerText = useWorkerStore.count;
//   }
// );

console.log('create');

export function setupCounter(element: HTMLButtonElement) {
  console.log('useStore.getState().counter', useStore.getState().count);
  useStore.subscribe(() => {
    element.innerHTML = `count is ${useStore.getState().count}`;
  });
  element.addEventListener('click', () => useStore.getState().increment());
  element.innerHTML = `count is ${useStore.getState().count}`;
}
