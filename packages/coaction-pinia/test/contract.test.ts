import { expectTypeOf } from 'vitest';
import { defineStore } from 'pinia';
import { runBinderAdapterContract } from '../../core/test/binderAdapterContract';
import { adapt, bindPinia } from '../src';

type Counter = {
  count: number;
  increment: () => void;
};

let counterId = 0;

const createCounterStore = () => {
  const id = `contract-counter-${counterId++}`;
  const definition = adapt<Counter>(
    defineStore(
      id,
      bindPinia({
        state: () => ({
          count: 0
        }),
        actions: {
          increment() {
            this.count += 1;
          }
        }
      })
    )
  );
  const external = definition();
  return {
    definition,
    external
  };
};

runBinderAdapterContract({
  packageName: '@coaction/pinia',
  createLocalContract: () => {
    const { definition, external } = createCounterStore();
    return {
      createState: () => definition,
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
    const server = createCounterStore();
    const client = createCounterStore();
    return {
      createServerState: () => server.definition,
      createClientState: () => client.definition,
      readValue: (store) => store.getState().count,
      invokeServer: (store) => store.getState().increment(),
      expectedValueAfterServerUpdate: 1,
      invokeClient: (store) => store.getState().increment(),
      expectedValueAfterClientUpdate: 2
    };
  }
});

test('type expectations', () => {
  const { definition } = createCounterStore();
  expectTypeOf(definition).toMatchTypeOf<Counter>();
});
