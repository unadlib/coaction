import { createWithMobx, makeAutoObservable } from '@coaction/mobx';

export const useStore = createWithMobx({
  counter: () =>
    makeAutoObservable({
      name: 'test',
      count: 0,
      get double() {
        return this.count * 2;
      },
      increment() {
        this.count += 1;
        console.log('count', this.count, this.double);
      }
    })
});

globalThis.useStore = useStore;

// @ts-ignore
globalThis.WorkerGlobalScope && console.log('store', globalThis.name ?? 'main');
