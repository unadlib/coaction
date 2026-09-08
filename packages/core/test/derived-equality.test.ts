import { create, effect } from '../index';
import { derive, derivePath } from 'coaction/derived';
import { createStore } from '../src/storeFactory';

test('custom equality retains equivalent outputs and suppresses downstream work', () => {
  const store = create({ n: 0 });
  let calls = 0;
  let effects = 0;
  const parity = derive(
    store,
    (s) => {
      calls++;
      return { even: s.n % 2 === 0 };
    },
    {
      deep: true,
      equals: (a, b) => a.even === b.even
    }
  );
  const stop = effect(() => {
    parity();
    effects++;
  });
  const before = parity();
  store.setState({ n: 2 });
  expect(parity()).toBe(before);
  expect(calls).toBe(2);
  expect(effects).toBe(1);
  store.setState({ n: 3 });
  expect(parity()).not.toBe(before);
  expect(effects).toBe(2);
  stop();
  store.destroy();
});

test('equal outputs still reconcile changing dependencies', () => {
  const { store, internal } = createStore(
    { left: true, a: { n: 1 }, b: { n: 1 } },
    {}
  );
  let calls = 0;
  const result = derive(
    store,
    (s) => {
      calls++;
      return { n: (s.left ? s.a : s.b).n };
    },
    { deep: true, equals: (a, b) => a.n === b.n }
  );
  const before = result();
  store.setState({ left: false });
  expect(result()).toBe(before);
  store.setState((s) => {
    s.a.n++;
  });
  expect(result()).toBe(before);
  expect(calls).toBe(2);
  store.setState((s) => {
    s.b.n++;
  });
  expect(result().n).toBe(2);
  result.dispose();
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
});

test('comparators do not retain their own incidental state reads', () => {
  const { store, internal } = createStore({ n: 0, other: { x: 1 } }, {});
  const n = derivePath(store, ['n'], {
    equals: (a, b) => {
      void store.getState().other.x;
      return Object.is(a, b);
    }
  });
  n();
  store.setState({ n: 1 });
  expect(n()).toBe(1);
  expect(internal.reactivePathActiveCount).toBe(1);
  n.dispose();
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
});

test('comparator errors are cached and recover on a later valid input', () => {
  const store = create({ n: 0 });
  const n = derive(store, (s) => s.n, {
    equals: (a, b) => {
      if (b === 1) throw new Error('comparison');
      return a === b;
    }
  });
  expect(n()).toBe(0);
  store.setState({ n: 1 });
  expect(() => n()).toThrow('comparison');
  expect(() => n()).toThrow('comparison');
  store.setState({ n: 2 });
  expect(n()).toBe(2);
  store.destroy();
});

test.each([false, true])(
  'live facade versions cannot be hidden behind output equality (wrapped=%s)',
  (wrapped) => {
    const store = create({ n: 0 });
    const root = derive(store, (s) => (wrapped ? { state: s } : s), {
      equals: () => true
    });
    let notifications = 0;
    const stop = effect(() => {
      root();
      notifications++;
    });
    store.setState({ n: 1 });
    expect(notifications).toBe(2);
    expect(store.getState().n).toBe(1);
    stop();
    store.destroy();
  }
);

test('draft reads do not use or alter the committed output comparator', () => {
  const store = create({ n: 0 });
  let comparisons = 0;
  const n = derivePath(store, ['n'], {
    equals: (a, b) => {
      comparisons++;
      return a === b;
    }
  });
  expect(n()).toBe(0);
  expect(() =>
    store.setState((s) => {
      s.n = 1;
      expect(n()).toBe(1);
      throw new Error('rollback');
    })
  ).toThrow('rollback');
  expect(n()).toBe(0);
  expect(comparisons).toBe(0);
  store.destroy();
});
