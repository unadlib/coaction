import { create, Slices } from 'coaction';
import { bindMobx } from '@coaction/mobx';
import { makeAutoObservable } from 'mobx';

type Counter = Slices<
  {
    counter: {
      count: number;
      increment1: () => void;
      increment: () => Promise<void>;
    };
  },
  'counter'
>;

const counter: Counter = (set) =>
  makeAutoObservable(
    bindMobx({
      name: 'test',
      count: 0,
      get double() {
        return this.count * 2;
      },
      increment1() {
        this.count += 1;
      },
      async increment() {
        set(() => {
          this.increment1();
        });
        set(() => {
          this.count += 1;
        });
        set(() => {
          this.count += 1;
        });
        set(() => {
          this.increment1();
        });
        set((state) => {
          state.counter.increment1();
        });
      }
    })
  );

export const useStore = create(
  {
    counter
  },
  {
    enablePatches: true
  }
);
