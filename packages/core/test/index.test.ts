import { create } from '../src';

test('base', () => {
  const useStore = create((set) => ({
    name: 'test',
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));
  // TODO: fix this
  // @ts-ignore
  const { count, increment, name } = useStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(name).toBe('test');
  expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 0,
    "increment": [Function],
    "name": "test",
  }
  `);
  const fn = jest.fn();
  useStore.subscribe(fn);
  useStore.getState().increment();
  expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 1,
    "increment": [Function],
    "name": "test",
  }
  `);
  increment();
  expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 2,
    "increment": [Function],
    "name": "test",
  }
  `);
});

test('base - Slices', () => {
  const useStore = create({
    counter: (set) => ({
      name: 'test',
      count: 0,
      increment() {
        set((draft) => {
          // @ts-ignore
          draft.counter.count += 1;
        });
      }
    })
  });
  // TODO: fix this
  // @ts-ignore
  const { count, increment, name } = useStore().counter;
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(name).toBe('test');
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 0,
    "increment": [Function],
    "name": "test",
  },
}
`);
  const fn = jest.fn();
  useStore.subscribe(fn);
  // @ts-ignore
  useStore.getState().counter.increment();
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 1,
    "increment": [Function],
    "name": "test",
  },
}
`);
  increment();
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 2,
    "increment": [Function],
    "name": "test",
  },
}
`);
});
