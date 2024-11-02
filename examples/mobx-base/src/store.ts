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
        increment() {
          // this.count += 1;
          // this.a();
          set(() => {
            this.a();
          });
          // set(() => {
          //   this.count += 1;
          // });
          // await new Promise((resolve) => setTimeout(resolve, 1000));
          // this.count += 1;
          // set(() => {
          //   this.count += 1;
          // });
          // set(() => {
          //   this.a();
          // });
          // this.a();
        }
      })
    )
});
// @ts-ignore
globalThis.useStore = useStore;

// @ts-ignore
globalThis.WorkerGlobalScope && console.log('store', globalThis.name ?? 'main');
