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
  const storeDefinition = defineStore(
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
  );
  const definition = adapt<Counter>(storeDefinition);
  const external = storeDefinition();
  return {
    definition,
    storeDefinition,
    external
  };
};

runBinderAdapterContract({
  packageName: '@coaction/pinia',
  createLocalContract: () => {
    const { storeDefinition, external } = createCounterStore();
    return {
      createState: () => storeDefinition,
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
      createServerState: () => server.storeDefinition,
      createClientState: () => client.storeDefinition,
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
