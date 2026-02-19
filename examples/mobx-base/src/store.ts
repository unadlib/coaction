import type { Slice } from 'coaction';
import { bindMobx } from '@coaction/mobx';
import { makeAutoObservable } from 'mobx';

export type Counter = {
  count: number;
  readonly double: number;
  increment1: () => void;
  increment: () => Promise<void>;
};

export const counter: Slice<Counter> = (set) =>
  makeAutoObservable(
    bindMobx({
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
          state.increment1();
        });
      }
    })
  );
