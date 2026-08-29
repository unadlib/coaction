import { createRoot } from 'solid-js';
import type { Accessor } from 'solid-js';
import { expectTypeOf } from 'vitest';
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
    const result: void = useStore.getState().increment();
    expect(result).toBeUndefined();
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

test('autoSelector ignores non-enumerable getters', () => {
  const state = {
    count: 0,
    increment() {}
  };
  Object.defineProperty(state, 'hidden', {
    enumerable: false,
    configurable: true,
    get() {
      throw new Error('hidden getter should not be read');
    }
  });
  const useStore = create(() => state);
  createRoot((dispose) => {
    let selectors: any;
    expect(() => {
      selectors = useStore({ autoSelector: true });
    }).not.toThrow();
    expect(Object.prototype.hasOwnProperty.call(selectors, 'hidden')).toBe(
      false
    );
    dispose();
  });
});

test('autoSelector supports nested object selectors', () => {
  const useStore = create<{
    nested: {
      count: number;
    };
    increment: () => void;
  }>((set) => ({
    nested: {
      count: 0
    },
    increment() {
      set((draft) => {
        draft.nested.count += 1;
      });
    }
  }));
  createRoot((dispose) => {
    const selectors = useStore({ autoSelector: true });
    expect(selectors.nested.count()).toBe(0);
    selectors.increment();
    expect(selectors.nested.count()).toBe(1);
    dispose();
  });
});

test('autoSelector treats non-plain object values as leaf selectors', () => {
  const initialStamp = new Date('2026-01-01T00:00:00.000Z');
  const nextStamp = new Date('2026-01-02T00:00:00.000Z');
  const useStore = create<{
    stamp: Date;
    replaceStamp: () => void;
  }>((set) => ({
    stamp: initialStamp,
    replaceStamp() {
      set({
        stamp: nextStamp
      });
    }
  }));
  createRoot((dispose) => {
    const selectors = useStore({ autoSelector: true });
    expect(selectors.stamp()).toBe(initialStamp);
    selectors.replaceStamp();
    expect(selectors.stamp()).toBe(nextStamp);
    dispose();
  });
});

test('autoSelector types non-plain object values as leaf accessors', () => {
  const useStore = create<{
    stamp: Date;
    nested: {
      stamp: Date;
    };
  }>(() => ({
    stamp: new Date('2026-01-01T00:00:00.000Z'),
    nested: {
      stamp: new Date('2026-01-02T00:00:00.000Z')
    }
  }));

  const selectors = useStore({ autoSelector: true });
  expectTypeOf(selectors.stamp).toEqualTypeOf<Accessor<Date>>();
  expectTypeOf(selectors.nested.stamp).toEqualTypeOf<Accessor<Date>>();
});

test('autoSelector includes symbol keyed state and slices', () => {
  const valueKey = Symbol('solid-value');
  const sliceKey = Symbol('solid-slice');
  const useStore = create(() => ({
    [valueKey]: 1,
    count: 0
  })) as any;
  const useSliceStore = create(
    {
      [sliceKey]: () => ({
        count: 2
      })
    } as any,
    {
      sliceMode: 'slices'
    }
  ) as any;
  createRoot((dispose) => {
    const selectors = useStore({ autoSelector: true });
    const sliceSelectors = useSliceStore({ autoSelector: true });

    expect(Object.getOwnPropertySymbols(selectors)).toContain(valueKey);
    expect(selectors[valueKey]()).toBe(1);
    expect(Object.getOwnPropertySymbols(sliceSelectors)).toContain(sliceKey);
    expect(sliceSelectors[sliceKey].count()).toBe(2);
    dispose();
  });
});

test('slices autoSelector', () => {
  const useStore = create(
    {
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
    },
    {
      sliceMode: 'slices'
    }
  );
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

test('slices autoSelector does not expose rejected dynamic root keys', () => {
  const useStore = create(
    {
      counter: () => ({
        count: 0
      })
    },
    {
      sliceMode: 'slices'
    }
  );
  expect(() => {
    (useStore.getState() as any).meta = 1;
  }).toThrow(TypeError);
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
    const useStore = create(
      {
        counter: () => ({
          count: 0
        })
      },
      {
        sliceMode: 'slices'
      }
    );
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
