import { effectScope } from 'vue';
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
  const scope = effectScope();
  scope.run(() => {
    const state = useStore();
    const count = useStore((current) => current.count);
    const double = useStore((current) => current.double);
    expect(state.count).toBe(0);
    expect(count.value).toBe(0);
    expect(double.value).toBe(0);
    state.increment();
    expect(state.count).toBe(1);
    expect(count.value).toBe(1);
    expect(double.value).toBe(2);
  });
  scope.stop();
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
  const scope = effectScope();
  scope.run(() => {
    const selectors = useStore({ autoSelector: true });
    const cachedSelectors = useStore({ autoSelector: true });
    expect(cachedSelectors).toBe(selectors);
    expect(selectors.count.value).toBe(0);
    expect(selectors.double.value).toBe(0);
    selectors.increment();
    expect(selectors.count.value).toBe(1);
    expect(selectors.double.value).toBe(2);
  });
  scope.stop();
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
  const scope = effectScope();
  scope.run(() => {
    const selectors = useStore({ autoSelector: true });
    expect(selectors.counter.count.value).toBe(0);
    expect(selectors.counter.double.value).toBe(0);
    selectors.counter.increment();
    expect(selectors.counter.count.value).toBe(1);
    expect(selectors.counter.double.value).toBe(2);
  });
  scope.stop();
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
  expect(selectors.counter.count.value).toBe(0);
  expect(selectors.meta).toBeUndefined();
});

test('autoSelector ignores inherited enumerable keys', () => {
  const protoKey = '__coactionVueProto__';
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
    expect(selectors.counter.count.value).toBe(0);
    expect(
      Object.prototype.hasOwnProperty.call(selectors, protoKey)
    ).toBeFalsy();
  } finally {
    delete (Object.prototype as any)[protoKey];
  }
});
