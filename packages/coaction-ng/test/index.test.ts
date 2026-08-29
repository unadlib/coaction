import { computed } from '@angular/core';
import { create } from '../src';

test('base', () => {
  const store = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    get double() {
      return this.count * 2;
    },
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const count = store.select((state) => state.count);
  const double = store.select((state) => state.double);

  expect(store.state().count).toBe(0);
  expect(count()).toBe(0);
  expect(double()).toBe(0);

  const result: void = store.getState().increment();
  expect(result).toBeUndefined();

  expect(store.state().count).toBe(1);
  expect(count()).toBe(1);
  expect(double()).toBe(2);
});

test('slices', () => {
  const store = create(
    {
      counter: (set) => ({
        count: 0,
        increment() {
          set((draft) => {
            draft.counter.count += 1;
          });
        }
      })
    },
    {
      sliceMode: 'slices'
    }
  );

  const count = store.select((state) => state.counter.count);

  expect(store.state().counter.count).toBe(0);
  expect(count()).toBe(0);

  store.getState().counter.increment();

  expect(store.state().counter.count).toBe(1);
  expect(count()).toBe(1);
});

test('destroy disposes attached signal subscription', () => {
  const store = create<{
    count: number;
  }>(() => ({
    count: 0
  }));
  expect(store.state().count).toBe(0);
  store.destroy();
});

test('state signal notifies downstream computed values for stable state object', () => {
  const store = create<{
    count: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));
  const count = computed(() => store.state().count);

  expect(count()).toBe(0);

  store.getState().increment();

  expect(count()).toBe(1);
});

test('selected object signals notify downstream computed values for stable references', () => {
  const store = create<{
    count: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));
  const selectedState = store.select((state) => state);
  const count = computed(() => selectedState().count);

  expect(count()).toBe(0);

  store.getState().increment();

  expect(count()).toBe(1);
});
