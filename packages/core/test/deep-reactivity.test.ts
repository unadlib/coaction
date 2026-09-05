import { createReactiveTracker } from '../src/reactiveTracker';
import { create, type Middleware } from '../src';

test('deep reactive tracking ignores sibling leaf updates', () => {
  const store = create((set) => ({
    user: { profile: { name: 'Michael', age: 30 } },
    setName(name: string) {
      set(() => {
        this.user.profile.name = name;
      });
    },
    setAge(age: number) {
      set(() => {
        this.user.profile.age = age;
      });
    }
  }));
  const tracker = createReactiveTracker();
  let notifications = 0;
  const unsubscribe = tracker.subscribe(() => {
    notifications += 1;
  });

  expect(tracker.track(() => store.getState().user.profile.name)).toBe(
    'Michael'
  );
  store.getState().setAge(31);
  expect(notifications).toBe(0);

  store.getState().setName('Lin');
  expect(notifications).toBe(1);

  unsubscribe();
  tracker.dispose();
});

test('terminal object reads track that object without retaining parent traversal paths', () => {
  const store = create((set) => ({
    user: { profile: { name: 'Michael', age: 30 }, status: 'active' },
    birthday() {
      set(() => {
        this.user.profile.age += 1;
      });
    },
    deactivate() {
      set(() => {
        this.user.status = 'inactive';
      });
    }
  }));
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);

  const profile = tracker.track(() => store.getState().user.profile);
  expect(profile.name).toBe('Michael');

  store.getState().deactivate();
  expect(notifications).toBe(0);

  store.getState().birthday();
  expect(notifications).toBe(1);
  tracker.dispose();
});

test('deep reactive tracking observes missing keys and object structure', () => {
  const store = create((set) => ({
    values: {} as Record<string, number>,
    add() {
      set(() => {
        this.values.answer = 42;
      });
    }
  }));
  const missing = createReactiveTracker();
  const structure = createReactiveTracker();
  let missingChanges = 0;
  let structureChanges = 0;
  missing.subscribe(() => missingChanges++);
  structure.subscribe(() => structureChanges++);

  missing.track(() => store.getState().values.answer);
  structure.track(() => Object.keys(store.getState().values));
  store.getState().add();

  expect(missingChanges).toBe(1);
  expect(structureChanges).toBe(1);
});

test('array structural changes invalidate tracked indexes and length', () => {
  const store = create((set) => ({
    items: ['a', 'b'],
    removeFirst() {
      set(() => {
        this.items.shift();
      });
    }
  }));
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);
  tracker.track(
    () => `${store.getState().items[0]}:${store.getState().items.length}`
  );

  store.getState().removeFirst();
  expect(notifications).toBeGreaterThan(0);
  expect(store.getState().items[0]).toBe('b');
  expect(store.getState().items.length).toBe(1);
});

test('disposed trackers release deep path patch overhead', () => {
  let patchCalls = 0;
  // `patch` is a middleware-facing hook: it has to be installed on the store
  // the setState pipeline sees, which assigning to the returned store is not.
  const countPatches: Middleware<{
    user: { name: string; age: number };
    setAge: (age: number) => void;
  }> = (store) => {
    store.patch = (transition) => {
      patchCalls += 1;
      return transition;
    };
    return store;
  };
  const store = create(
    (set) => ({
      user: { name: 'Michael', age: 30 },
      setAge(age: number) {
        set(() => {
          this.user.age = age;
        });
      }
    }),
    { middlewares: [countPatches] }
  );

  store.getState().setAge(30);
  expect(patchCalls).toBe(0);

  const tracker = createReactiveTracker();
  tracker.track(() => store.getState().user.name);
  store.getState().setAge(31);
  expect(patchCalls).toBe(1);

  tracker.dispose();
  store.getState().setAge(32);
  expect(patchCalls).toBe(1);
});

test('array appends preserve stable tracked indexes', () => {
  const store = create((set) => ({
    items: ['a', 'b'],
    append(value: string) {
      set(() => {
        this.items.push(value);
      });
    }
  }));
  const first = createReactiveTracker();
  const length = createReactiveTracker();
  let firstChanges = 0;
  let lengthChanges = 0;
  first.subscribe(() => firstChanges++);
  length.subscribe(() => lengthChanges++);
  first.track(() => store.getState().items[0]);
  length.track(() => store.getState().items.length);

  store.getState().append('c');

  expect(firstChanges).toBe(0);
  expect(lengthChanges).toBeGreaterThan(0);
  first.dispose();
  length.dispose();
});

test('array insertions only invalidate shifted indexes', () => {
  const store = create((set) => ({
    items: ['a', 'b', 'c'],
    insert() {
      set(() => {
        this.items.splice(1, 0, 'x');
      });
    }
  }));
  const first = createReactiveTracker();
  const third = createReactiveTracker();
  let firstChanges = 0;
  let thirdChanges = 0;
  first.subscribe(() => firstChanges++);
  third.subscribe(() => thirdChanges++);
  first.track(() => store.getState().items[0]);
  third.track(() => store.getState().items[2]);

  store.getState().insert();

  expect(firstChanges).toBe(0);
  expect(thirdChanges).toBeGreaterThan(0);
  first.dispose();
  third.dispose();
});
