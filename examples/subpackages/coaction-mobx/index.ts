import { create } from 'coaction';
import { bindMobx } from '@coaction/mobx';
import { makeAutoObservable } from 'mobx';

type MobxState = {
  count: number;
  readonly double: number;
  increment: () => void;
};

export const runExample = () => {
  const store = create<MobxState>(
    () =>
      makeAutoObservable(
        bindMobx({
          count: 0,
          get double() {
            return this.count * 2;
          },
          increment() {
            this.count += 1;
          }
        })
      ),
    {
      name: 'mobx-example'
    }
  );

  store.getState().increment();
  const result = {
    count: store.getState().count,
    double: store.getState().double
  };
  store.destroy();

  return result;
};
