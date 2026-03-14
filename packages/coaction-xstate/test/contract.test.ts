import { expectTypeOf } from 'vitest';
import { runBinderAdapterContract } from '../../core/test/binderAdapterContract';
import { adapt, assign, bindXState, createActor, createMachine } from '../src';

type CounterEvent = {
  type: 'increment';
};

type Counter = {
  count: number;
  send: (event: CounterEvent) => void;
};

const createCounterStore = () => {
  const machine = createMachine({
    context: {
      count: 0
    },
    on: {
      increment: {
        actions: assign({
          count: ({ context }) => context.count + 1
        })
      }
    }
  });
  const actor = createActor(machine);
  actor.start();
  return {
    actor,
    state: adapt(bindXState(actor))
  };
};

runBinderAdapterContract({
  packageName: '@coaction/xstate',
  createLocalContract: () => {
    const { actor, state } = createCounterStore();
    return {
      createState: () => state,
      readValue: (store) => store.getState().count,
      invokeUpdate: (store) =>
        store.getState().send({
          type: 'increment'
        }),
      expectedValueAfterUpdate: 1,
      writeExternal: () => {
        actor.send({
          type: 'increment'
        });
      },
      expectedValueAfterExternalWrite: 2,
      cleanup: () => {
        actor.stop();
      }
    };
  }
});

test('type expectations', () => {
  const { state, actor } = createCounterStore();
  try {
    expectTypeOf(state).toMatchTypeOf<Counter>();
  } finally {
    actor.stop();
  }
});
