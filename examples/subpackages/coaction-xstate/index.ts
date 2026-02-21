import { create } from 'coaction';
import {
  adapt,
  assign,
  bindXState,
  createActor,
  createMachine
} from '@coaction/xstate';

export const runExample = () => {
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

  const store = create(() => adapt(bindXState(actor)), {
    name: 'xstate-example'
  });

  store.getState().send({
    type: 'increment'
  });

  const result = {
    count: store.getState().count
  };

  actor.stop();
  store.destroy();

  return result;
};
