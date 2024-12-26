import { useWorkerStore } from './store';

export function setupCounter(element: HTMLButtonElement) {
  useWorkerStore.subscribe(() => {
    element.innerHTML = `count is ${useWorkerStore.getState().counter.count}`;
  });
  element.addEventListener('click', () =>
    useWorkerStore.getState().counter.increment()
  );
  element.innerHTML = `count is ${useWorkerStore.getState().counter.count}`;
}
