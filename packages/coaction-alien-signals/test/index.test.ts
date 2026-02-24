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
  const cachedSelectors = useStore({ autoSelector: true });
  expect(cachedSelectors).toBe(selectors);
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

test('state proxy supports reflection traps and destroy lifecycle', () => {
  const useStore = create<{
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
  const state = useStore();
  expect('count' in state).toBe(true);
  expect(Reflect.ownKeys(state)).toContain('count');
  expect(Object.getOwnPropertyDescriptor(state, 'count')?.configurable).toBe(
    true
  );
  expect(Object.getOwnPropertyDescriptor(state, 'missing')).toBeUndefined();
  useStore.destroy();
});

test('slices autoSelector skips non-object slice values', () => {
  const useStore = create({
    counter: () => ({
      count: 0
    })
  });
  (useStore.getState() as any).meta = 1;
  const selectors = useStore({ autoSelector: true }) as any;
  expect(selectors.counter.count()).toBe(0);
  expect(selectors.meta).toBeUndefined();
});

test('autoSelector ignores inherited enumerable keys', () => {
  const protoKey = '__coactionAlienSignalsProto__';
  Object.defineProperty(Object.prototype, protoKey, {
    value: {
      count: 1
    },
    enumerable: true,
    configurable: true,
    writable: true
  });
  try {
    const useStore = create({
      counter: () => ({
        count: 0
      })
    });
    const selectors = useStore({ autoSelector: true }) as any;
    expect(selectors.counter.count()).toBe(0);
    expect(
      Object.prototype.hasOwnProperty.call(selectors, protoKey)
    ).toBeFalsy();
  } finally {
    delete (Object.prototype as any)[protoKey];
  }
});
