import { makeAutoObservable } from 'mobx';
import { create } from 'coaction';
import { runCommitReplayInvariant } from '../../core/test/commitReplayInvariant';
import { bindMobx } from '../src';

let storeId = 0;

runCommitReplayInvariant({
  packageName: '@coaction/mobx',
  createStore: () => {
    // Two actions can be waiting at once, so every outstanding gate is kept.
    const waiting: Array<() => void> = [];
    const gate = () =>
      new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    const store = create<any>(
      () =>
        makeAutoObservable(
          bindMobx({
            n: 0,
            step() {
              this.n += 1;
            },
            nested() {
              this.n += 10;
              this.step();
              this.n += 10;
            },
            async suspend() {
              this.n += 100;
              await gate();
              this.n += 100;
            },
            async suspendThenNested() {
              this.n += 1000;
              await gate();
              this.step();
              this.n += 1000;
            }
          })
        ),
      { name: `mobx-replay-${storeId++}`, enablePatches: true }
    );
    return {
      store: store as never,
      release: () => waiting.splice(0).forEach((go) => go())
    };
  }
});
