import { createReactiveTracker } from '../src/reactiveTracker';
import { createStore } from '../src/storeFactory';
import { sharedRegistry } from '../src/sharedRegistry';

const pathsOf = (value: object) =>
  (sharedRegistry.publicStatePathMeta.get(value) as { paths: PropertyKey[][] })
    .paths;

test('circular readonly traversal keeps canonical identity and bounded paths', () => {
  const node = { n: 1, self: null as any };
  node.self = node;
  const { store, internal } = createStore({ node }, {});
  const tracker = createReactiveTracker();
  for (let i = 0; i < 1000; i++) {
    tracker.track(() => {
      const value = store.getState().node;
      expect(value.self.self).toBe(value);
      expect(value.self.n).toBe(1);
    });
  }
  expect(pathsOf(store.getState().node)).toEqual([['node']]);
  expect(internal.reactivePathActiveCount).toBeLessThanOrEqual(2);
  tracker.dispose();
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
});

test('distinct alias branches preserve identity and dependencies across replacements', () => {
  const { store, internal } = createStore(
    { anchor: { n: 1 }, dict: {} as Record<string, { n: number }> },
    {}
  );
  const tracker = createReactiveTracker();
  const anchor = store.getPureState().anchor;
  for (let i = 0; i < 1000; i++) {
    store.setState({ anchor, dict: { [String(i)]: anchor } });
    tracker.track(() => {
      const value = store.getState().dict[String(i)];
      expect(value).toBe(store.getState().anchor);
      expect(value.n).toBe(1);
    });
  }
  expect(pathsOf(store.getState().anchor)).toHaveLength(2);
  expect(internal.reactivePathActiveCount).toBeLessThanOrEqual(2);
  let changes = 0;
  tracker.subscribe(() => changes++);
  store.setState({ dict: { '999': { n: 2 } } });
  expect(changes).toBe(1);
  expect(tracker.track(() => store.getState().dict['999'].n)).toBe(2);
  tracker.dispose();
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
});
