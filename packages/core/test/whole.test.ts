import { create, whole } from '../src';
import { createReactiveTracker } from '../src/reactiveTracker';

type Shape = {
  items: { v: number }[];
  other: number;
  bump: (index: number) => void;
  touchOther: () => void;
  append: () => void;
};

const createStore = () =>
  create<Shape>((set) => ({
    items: [{ v: 1 }, { v: 2 }],
    other: 0,
    bump(index: number) {
      set(() => {
        this.items[index].v += 1;
      });
    },
    touchOther() {
      set(() => {
        this.other += 1;
      });
    },
    append() {
      set(() => {
        this.items.push({ v: 9 });
      });
    }
  }));

test('returns the store data itself, not a tracking proxy', () => {
  const store = createStore();
  const scanned = whole(store.getState().items);
  expect(scanned).toBe(store.getPureState().items);
  expect(scanned).not.toBe(store.getState().items);
  expect(scanned.map((item) => item.v)).toEqual([1, 2]);
});

test('records one dependency covering everything inside the value', () => {
  const store = createStore();
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);

  const total = tracker.track(() =>
    whole(store.getState().items).reduce((sum, item) => sum + item.v, 0)
  );
  expect(total).toBe(3);

  // An unrelated top-level write must not disturb it.
  store.getState().touchOther();
  expect(notifications).toBe(0);

  // Anything inside the value does.
  store.getState().bump(0);
  expect(notifications).toBe(1);
  tracker.dispose();
});

test('a structural change to the value also invalidates it', () => {
  const store = createStore();
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);
  tracker.track(() => whole(store.getState().items).length);

  store.getState().append();
  expect(notifications).toBe(1);
  tracker.dispose();
});

test('a deep element write reaches a dependency taken on an ancestor', () => {
  const store = createStore();
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);
  tracker.track(() => whole(store.getState().items)[1].v);

  store.getState().bump(1);
  expect(notifications).toBe(1);
  tracker.dispose();
});

test('leaves values that did not come from a store alone', () => {
  const plain = { a: 1 };
  const list = [1, 2, 3];
  expect(whole(plain)).toBe(plain);
  expect(whole(list)).toBe(list);
  expect(whole(42)).toBe(42);
  expect(whole(null)).toBe(null);
  expect(whole(undefined)).toBe(undefined);
  expect(whole('text')).toBe('text');
});

test('outside a tracked scope it is just a plain read', () => {
  const store = createStore();
  expect(() => whole(store.getState().items)).not.toThrow();
  expect(whole(store.getState().items)).toBe(store.getPureState().items);
});
