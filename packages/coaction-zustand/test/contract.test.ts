import { expectTypeOf } from 'vitest';
import { create as createWithZustand } from 'zustand';
import { runBinderAdapterContract } from '../../core/test/binderAdapterContract';
import { adapt, bindZustand } from '../src';

type Counter = {
  count: number;
  increment: () => void;
};

const createCounterStore = () =>
  createWithZustand<Counter>(
    bindZustand((set, get) => ({
      count: 0,
      increment() {
        set({
          count: get().count + 1
        });
      }
    }))
  );

runBinderAdapterContract({
  packageName: '@coaction/zustand',
  createLocalContract: () => {
    const external = createCounterStore();
    return {
      createState: () => adapt(external),
      readValue: (store) => store.getState().count,
      invokeUpdate: (store) => store.getState().increment(),
      expectedValueAfterUpdate: 1,
      writeExternal: () => {
        external.setState({
          count: 7
        });
      },
      expectedValueAfterExternalWrite: 7
    };
  },
  createWorkerContract: () => {
    const serverExternal = createCounterStore();
    const clientExternal = createCounterStore();
    return {
      createServerState: () => adapt(serverExternal),
      createClientState: () => adapt(clientExternal),
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
  expectTypeOf(adapt(external)).toMatchTypeOf<Counter>();
});
