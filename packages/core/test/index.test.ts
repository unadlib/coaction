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
