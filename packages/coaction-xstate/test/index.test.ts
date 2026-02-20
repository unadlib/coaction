import { create, Slices } from 'coaction';
import { adapt, assign, bindXState, createActor, createMachine } from '../src';

test('base', () => {
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
  const useStore = create(() => adapt(bindXState(actor)), {
    name: 'test'
  });
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "send": [Function],
}
`);
  useStore.getState().send({
    type: 'increment'
  });
  expect(useStore.getState().count).toBe(1);
  actor.send({
    type: 'increment'
  });
  expect(useStore.getState().count).toBe(2);
  expect(() =>
    useStore.setState({
      count: 100
    })
  ).toThrow(
    'setState is not supported with xstate binding. Please use actor events.'
  );
});

describe('Slices', () => {
  test('base - unsupported', () => {
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
    expect(() => {
      create<{
        counter: Slices<
          {
            counter: {
              count: number;
              send: (event: { type: 'increment' }) => void;
            };
          },
          'counter'
        >;
      }>(
        {
          counter: () => adapt(bindXState(actor))
        },
        {
          name: 'test'
        }
      );
    }).toThrow(
      'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
    );
  });
});
