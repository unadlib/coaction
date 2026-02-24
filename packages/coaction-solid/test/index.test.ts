import { createRoot } from 'solid-js';
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
  createRoot((dispose) => {
    const state = useStore();
    const count = useStore((current) => current.count);
    const double = useStore((current) => current.double);
    expect(state().count).toBe(0);
    expect(count()).toBe(0);
    expect(double()).toBe(0);
    useStore.getState().increment();
    expect(state().count).toBe(1);
    expect(count()).toBe(1);
    expect(double()).toBe(2);
    dispose();
  });
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
  createRoot((dispose) => {
    const selectors = useStore({ autoSelector: true });
    const cachedSelectors = useStore({ autoSelector: true });
    expect(cachedSelectors).toBe(selectors);
    expect(selectors.count()).toBe(0);
    expect(selectors.double()).toBe(0);
    selectors.increment();
    expect(selectors.count()).toBe(1);
    expect(selectors.double()).toBe(2);
    dispose();
  });
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
  createRoot((dispose) => {
    const selectors = useStore({ autoSelector: true });
    expect(selectors.counter.count()).toBe(0);
    expect(selectors.counter.double()).toBe(0);
    selectors.counter.increment();
    expect(selectors.counter.count()).toBe(1);
    expect(selectors.counter.double()).toBe(2);
    dispose();
  });
});

test('destroy unsubscribes solid listener lifecycle', () => {
  const useStore = create<{
    count: number;
  }>(() => ({
    count: 0
  }));
  createRoot((dispose) => {
    const state = useStore();
    expect(state().count).toBe(0);
    useStore.destroy();
    dispose();
  });
});

test('slices autoSelector skips non-object state entries', () => {
  const useStore = create({
    counter: () => ({
      count: 0
    })
  });
  (useStore.getState() as any).meta = 1;
  createRoot((dispose) => {
    const selectors = useStore({ autoSelector: true }) as any;
    expect(selectors.counter.count()).toBe(0);
    expect(selectors.meta).toBeUndefined();
    dispose();
  });
});

test('autoSelector ignores inherited enumerable keys', () => {
  const protoKey = '__coactionSolidProto__';
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
    createRoot((dispose) => {
      const selectors = useStore({ autoSelector: true }) as any;
      expect(selectors.counter.count()).toBe(0);
      expect(
        Object.prototype.hasOwnProperty.call(selectors, protoKey)
      ).toBeFalsy();
      dispose();
    });
  } finally {
    delete (Object.prototype as any)[protoKey];
  }
});
