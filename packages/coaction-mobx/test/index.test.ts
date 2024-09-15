import { makeAutoObservable, autorun } from 'mobx';
import { createWithMobx } from '../src';

test('base', () => {
  const store = makeAutoObservable({
    name: 'test',
    count: 0,
    increment() {
      this.count += 1;
    }
  });
  autorun(() => {
    console.log(store.count);
  });
  expect(store.count).toBe(0);
  expect(store.increment).toBeInstanceOf(Function);
  expect(store.name).toBe('test');
  store.increment();
  expect(store.count).toBe(1);
});

test.only('base', () => {
  const useStore = createWithMobx(() =>
    makeAutoObservable({
      name: 'test',
      count: 0,
      increment() {
        this.count += 1;
      }
    })
  );
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
  useStore.subscribe(() => {
    fn(useStore.getState().count);
  });
  // // @ts-ignore
  useStore.getState().increment();
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
  "name": "test",
}
`);
  expect(fn).toHaveBeenCalledTimes(2);
  // useStore.getState().increment();
  increment.call(useStore.getState());
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
  "name": "test",
}
`);
  expect(fn).toHaveBeenCalledTimes(3);
});
