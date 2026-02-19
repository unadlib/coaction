import { create } from '../src';

test('base', () => {
  const useStore = create<{
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
  const count = useStore((current) => current.count);
  const double = useStore((current) => current.double);
  expect(useStore().count).toBe(0);
  expect(count()).toBe(0);
  expect(double()).toBe(0);
  useStore().increment();
  expect(useStore().count).toBe(1);
  expect(count()).toBe(1);
  expect(double()).toBe(2);
});

test('autoSelector', () => {
  const useStore = create<{
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
  const selectors = useStore({ autoSelector: true });
  expect(selectors.count()).toBe(0);
  expect(selectors.double()).toBe(0);
  selectors.increment();
  expect(selectors.count()).toBe(1);
  expect(selectors.double()).toBe(2);
});

test('slices autoSelector', () => {
  const useStore = create({
    counter: (set) => ({
      count: 0,
      get double() {
        return this.count * 2;
      },
      increment() {
        set((draft) => {
          draft.counter.count += 1;
        });
      }
    })
  });
  const selectors = useStore({ autoSelector: true });
  expect(selectors.counter.count()).toBe(0);
  expect(selectors.counter.double()).toBe(0);
  selectors.counter.increment();
  expect(selectors.counter.count()).toBe(1);
  expect(selectors.counter.double()).toBe(2);
});
