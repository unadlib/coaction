import { create, Slices } from 'coaction';
import { adapt, bindValtio, proxy } from '../src';

test('base', () => {
  const state = proxy(
    bindValtio({
      count: 0,
      get double() {
        return this.count * 2;
      },
      increment() {
        this.count += 1;
      }
    })
  );
  const useStore = create(() => adapt(state), {
    name: 'test'
  });
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "double": 0,
  "increment": [Function],
}
`);
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(1);
  expect(state.count).toBe(1);
  state.count = 10;
  expect(useStore.getState().count).toBe(10);
  expect(useStore.getState().double).toBe(20);
});

describe('Slices', () => {
  test('base - unsupported', () => {
    const state = proxy(
      bindValtio({
        count: 0,
        increment() {
          this.count += 1;
        }
      })
    );
    expect(() => {
      create<{
        counter: Slices<
          {
            counter: {
              count: number;
              increment: () => void;
            };
          },
          'counter'
        >;
      }>(
        {
          counter: () => adapt(state)
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
