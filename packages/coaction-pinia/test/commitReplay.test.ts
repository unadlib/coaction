// @ts-nocheck
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { create } from 'coaction';
import { runCommitReplayInvariant } from '../../core/test/commitReplayInvariant';
import { adapt, bindPinia } from '../src';

let storeId = 0;

runCommitReplayInvariant({
  packageName: '@coaction/pinia',
  createStore: () => {
    const waiting: Array<() => void> = [];
    const gate = () =>
      new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    setActivePinia(createPinia());
    const id = `pinia-replay-${storeId++}`;
    const store = create<any>(
      () =>
        adapt<any>(
          defineStore(
            id,
            bindPinia({
              state: () => ({ n: 0 }),
              actions: {
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
              }
            })
          )
        ),
      { name: id, enablePatches: true }
    );
    return {
      store: store as never,
      release: () => waiting.splice(0).forEach((go) => go())
    };
  }
});
