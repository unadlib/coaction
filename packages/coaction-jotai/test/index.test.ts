import { create, Slices } from 'coaction';
import { adapt, atom, bindJotai, createStore } from '../src';

test('base', () => {
  const countAtom = atom(0);
  const jotaiStore = createStore();
  const useStore = create(
    () =>
      adapt(
        bindJotai({
          store: jotaiStore,
          atoms: {
            count: countAtom
          },
          actions: ({ store, atoms }) => ({
            increment() {
              store.set(atoms.count, store.get(atoms.count) + 1);
            }
          })
        })
      ),
    {
      name: 'test'
    }
  );
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
}
`);
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(1);
  expect(jotaiStore.get(countAtom)).toBe(1);
  jotaiStore.set(countAtom, 5);
  expect(useStore.getState().count).toBe(5);
  useStore.setState({
    count: 8
  });
  expect(jotaiStore.get(countAtom)).toBe(8);
});

describe('Slices', () => {
  test('base - unsupported', () => {
    const countAtom = atom(0);
    const jotaiStore = createStore();
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
          counter: () =>
            adapt(
              bindJotai({
                store: jotaiStore,
                atoms: {
                  count: countAtom
                },
                actions: ({ store, atoms }) => ({
                  increment() {
                    store.set(atoms.count, store.get(atoms.count) + 1);
                  }
                })
              })
            )
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
