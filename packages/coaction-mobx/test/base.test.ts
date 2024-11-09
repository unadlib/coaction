import {
  createTransport,
  mockPorts,
  type WorkerMainTransportOptions
} from 'data-transport';
import { bindMobx } from '../src';
import { makeAutoObservable, autorun } from 'mobx';
import { create, type Slices, type Slice } from 'coaction';

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>(
    (set, get, api) =>
      makeAutoObservable(
        bindMobx({
          count: 0,
          get double() {
            return this.count * 2;
          },
          increment() {
            set({
              count: this.count + 1
            });
          }
        })
      ),
    {
      id: 'test'
    }
  );
  const { count, increment } = useStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useStore.id).toBe('test');
  expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 0,
    "double": 0,
    "increment": [Function],
  }
  `);
  const fn = jest.fn();
  useStore.subscribe(fn);
  useStore.getState().increment();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 1,
    "double": 2,
    "increment": [Function],
  }
  `);
  increment();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 2,
    "double": 4,
    "increment": [Function],
  }
  `);
});
