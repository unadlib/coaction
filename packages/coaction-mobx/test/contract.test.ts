import { expectTypeOf } from 'vitest';
import { makeAutoObservable } from 'mobx';
import { runBinderAdapterContract } from '../../core/test/binderAdapterContract';
import { bindMobx } from '../src';

type Counter = {
  count: number;
  increment: () => void;
};

const createCounterStore = () =>
  makeAutoObservable(
    bindMobx({
      count: 0,
      increment() {
        this.count += 1;
      }
    })
  );

runBinderAdapterContract({
  packageName: '@coaction/mobx',
  createLocalContract: () => {
    const external = createCounterStore();
    return {
      createState: () => external,
      readValue: (store) => store.getState().count,
      invokeUpdate: (store) => store.getState().increment(),
      expectedValueAfterUpdate: 1,
      writeExternal: () => {
        external.count = 7;
      },
      expectedValueAfterExternalWrite: 7
    };
  },
  createWorkerContract: () => {
    const serverExternal = createCounterStore();
    const clientExternal = createCounterStore();
    return {
      createServerState: () => serverExternal,
      createClientState: () => clientExternal,
      readValue: (store) => store.getState().count,
      invokeServer: (store) => store.getState().increment(),
      expectedValueAfterServerUpdate: 1,
      invokeClient: (store) => store.getState().increment(),
      expectedValueAfterClientUpdate: 2
    };
  }
});

test('type expectations', () => {
  const external = createCounterStore();
  expectTypeOf(external).toMatchTypeOf<Counter>();
});
