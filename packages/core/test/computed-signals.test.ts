import { create } from '../src';

test('accessor getters are cached computed values', () => {
  let getterCalls = 0;
  const store = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    get double() {
      getterCalls += 1;
      return this.count * 2;
    },
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  expect(store.getState().double).toBe(0);
  expect(store.getState().double).toBe(0);
  expect(getterCalls).toBe(1);

  store.getState().increment();

  expect(store.getState().double).toBe(2);
  expect(store.getState().double).toBe(2);
  expect(getterCalls).toBe(2);
});

test('accessor getters read fresh draft values during mutation', () => {
  const seen: number[] = [];
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
      set(() => {
        this.count += 1;
        seen.push(this.double);
      });
    }
  }));

  expect(store.getState().double).toBe(0);
  store.getState().increment();

  expect(seen).toEqual([2]);
  expect(store.getState().double).toBe(2);
});

test('failed mutations do not poison accessor computed cache', () => {
  const store = create<{
    count: number;
    readonly double: number;
    fail: () => void;
    setTen: () => void;
  }>((set) => ({
    count: 0,
    get double() {
      return this.count * 2;
    },
    fail() {
      set(() => {
        this.count = 10;
        void this.double;
        throw new Error('boom');
      });
    },
    setTen() {
      set(() => {
        this.count = 10;
      });
    }
  }));

  expect(store.getState().double).toBe(0);
  expect(() => store.getState().fail()).toThrow('boom');
  expect(store.getState().count).toBe(0);
  expect(store.getState().double).toBe(0);

  store.getState().setTen();

  expect(store.getState().double).toBe(20);
});

test('manual get dependencies use signal-backed computed caching', () => {
  let selectorCalls = 0;
  const seen: number[] = [];
  const store = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>((set, get) => ({
    count: 0,
    double: get(
      (state) => [state.count],
      (count) => {
        selectorCalls += 1;
        return count * 2;
      }
    ),
    increment() {
      set(() => {
        this.count += 1;
        seen.push(this.double);
      });
    }
  }));

  expect(store.getState().double).toBe(0);
  expect(store.getState().double).toBe(0);
  expect(selectorCalls).toBe(1);

  store.getState().increment();

  expect(seen).toEqual([2]);
  expect(store.getState().double).toBe(2);
  expect(store.getState().double).toBe(2);
  expect(selectorCalls).toBe(2);
});
