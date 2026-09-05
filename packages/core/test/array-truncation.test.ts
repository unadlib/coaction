import { create } from '../src';
import { createReactiveTracker } from '../src/reactiveTracker';

const createList = () =>
  create<{
    items: number[];
    truncate: (length: number) => void;
    replaceLast: (value: number) => void;
  }>((set) => ({
    items: [1, 2, 3],
    truncate(length) {
      set(() => {
        this.items.length = length;
      });
    },
    replaceLast(value) {
      set(() => {
        this.items[this.items.length - 1] = value;
      });
    }
  }));

test('shortening an array invalidates the indexes it dropped', () => {
  const store = createList();
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);

  expect(tracker.track(() => store.getState().items[2])).toBe(3);
  store.getState().truncate(1);

  expect(store.getState().items[2]).toBeUndefined();
  expect(notifications).toBe(1);
  tracker.dispose();
});

test('an index that survives the truncation is left alone', () => {
  const store = createList();
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);
  tracker.track(() => store.getState().items[0]);

  store.getState().truncate(1);
  expect(notifications).toBe(0);
  tracker.dispose();
});

test('length and structure both invalidate when an array is shortened', () => {
  const store = createList();
  const length = createReactiveTracker();
  const keys = createReactiveTracker();
  let lengthChanges = 0;
  let keyChanges = 0;
  length.subscribe(() => lengthChanges++);
  keys.subscribe(() => keyChanges++);
  length.track(() => store.getState().items.length);
  keys.track(() => Object.keys(store.getState().items));

  store.getState().truncate(1);
  expect(lengthChanges).toBe(1);
  expect(keyChanges).toBe(1);
  length.dispose();
  keys.dispose();
});

test('a plain element write is unaffected by the truncation handling', () => {
  const store = createList();
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);
  tracker.track(() => store.getState().items[2]);

  store.getState().replaceLast(9);
  expect(store.getState().items[2]).toBe(9);
  expect(notifications).toBe(1);
  tracker.dispose();
});
