import { create } from '../src';
import { createReactiveTracker } from '../src/reactiveTracker';

const createCounter = () =>
  create((set) => ({
    user: { name: 'Michael', age: 30 },
    setName(name: string) {
      set(() => {
        this.user.name = name;
      });
    }
  }));

test('getSnapshot advances only while a tracked path actually changes', () => {
  const store = createCounter();
  const tracker = createReactiveTracker();
  tracker.track(() => store.getState().user.name);
  const initial = tracker.getSnapshot();

  store.getState().setName('Lin');
  expect(tracker.getSnapshot()).toBeGreaterThan(initial);
  tracker.dispose();
});

test('a disposed tracker stops recording, notifying and subscribing', () => {
  const store = createCounter();
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);
  tracker.track(() => store.getState().user.name);
  expect(tracker.hasDependencies()).toBe(true);

  tracker.dispose();
  expect(tracker.hasDependencies()).toBe(false);

  // Reading through a disposed tracker still returns the value, but records
  // nothing, so later writes cannot notify it.
  expect(tracker.track(() => store.getState().user.name)).toBe('Michael');
  expect(tracker.hasDependencies()).toBe(false);

  const snapshot = tracker.getSnapshot();
  store.getState().setName('Lin');
  expect(notifications).toBe(0);
  expect(tracker.getSnapshot()).toBe(snapshot);

  // Subscribing after disposal hands back a no-op unsubscribe.
  const unsubscribe = tracker.subscribe(() => notifications++);
  store.getState().setName('Ada');
  expect(notifications).toBe(0);
  expect(() => unsubscribe()).not.toThrow();
});

test('dispose is idempotent', () => {
  const tracker = createReactiveTracker();
  tracker.dispose();
  expect(() => tracker.dispose()).not.toThrow();
  expect(tracker.hasDependencies()).toBe(false);
});

test('unsubscribing stops one listener without affecting the others', () => {
  const store = createCounter();
  const tracker = createReactiveTracker();
  let kept = 0;
  let dropped = 0;
  tracker.subscribe(() => kept++);
  const unsubscribe = tracker.subscribe(() => dropped++);
  tracker.track(() => store.getState().user.name);

  store.getState().setName('Lin');
  expect(kept).toBe(1);
  expect(dropped).toBe(1);

  // A tracker notifies once and then waits to be re-read, so re-track before
  // expecting the next write to reach the remaining listener.
  tracker.track(() => store.getState().user.name);
  unsubscribe();
  store.getState().setName('Ada');
  expect(kept).toBe(2);
  expect(dropped).toBe(1);
  tracker.dispose();
});

test('a throwing tracked function propagates and leaves the tracker usable', () => {
  const store = createCounter();
  const tracker = createReactiveTracker();
  expect(() =>
    tracker.track(() => {
      void store.getState().user.name;
      throw new Error('selector blew up');
    })
  ).toThrow('selector blew up');

  let notifications = 0;
  tracker.subscribe(() => notifications++);
  expect(tracker.track(() => store.getState().user.name)).toBe('Michael');
  store.getState().setName('Lin');
  expect(notifications).toBe(1);
  tracker.dispose();
});
