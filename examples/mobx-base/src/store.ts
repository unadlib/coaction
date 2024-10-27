import { create } from 'coaction';
import { bindMobx } from '@coaction/mobx';
import { makeAutoObservable } from 'mobx';

export const useStore = create({
  counter: (set) =>
    makeAutoObservable(
      bindMobx({
        name: 'test',
        count: 0,
        get double() {
          return this.count * 2;
        },
        a() {
          this.count += 1;
          console.log('count', this.count, this.double);
        },
        async increment() {
          set(() => {
            this.a();
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          set(() => {
            this.a();
          });
        }
      })
    )
});
// @ts-ignore
globalThis.useStore = useStore;

// @ts-ignore
globalThis.WorkerGlobalScope && console.log('store', globalThis.name ?? 'main');
