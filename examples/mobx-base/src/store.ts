import { createWithMobx } from '@coaction/mobx';
import { makeAutoObservable } from 'mobx';

export const useStore = createWithMobx({
  counter: () =>
    makeAutoObservable({
      name: 'test',
      count: 0,
      increment() {
        this.count += 1;
      }
    })
});

globalThis.useStore = useStore;

// @ts-ignore
globalThis.WorkerGlobalScope && console.log('store', globalThis.name ?? 'main');
