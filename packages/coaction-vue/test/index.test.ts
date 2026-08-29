import { expectTypeOf } from 'vitest';
import { effectScope, type ComputedRef } from 'vue';
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
    const result: void = state.increment();
    expect(result).toBeUndefined();
    expect(state.count).toBe(1);
    expect(count.value).toBe(1);
    expect(double.value).toBe(2);
  });
  scope.stop();
});

test('throws when immutable action mutates this directly outside set', () => {
  const useStore = create<{
    count: number;
    step: number;
    increment: () => void;
  }>(() => ({
    count: 0,
    step: 1,
    increment() {
      this.count += this.step;
    }
  }));

  expect(() => useStore.getState().increment()).toThrow(
    'Direct state mutation is not allowed in immutable Coaction stores. Wrap mutations in set(() => { ... }).'
  );
  expect(useStore.getState().count).toBe(0);
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
  const scope = effectScope();
  scope.run(() => {
    let selectors: any;
    expect(() => {
      selectors = useStore({ autoSelector: true });
    }).not.toThrow();
    expect(Object.prototype.hasOwnProperty.call(selectors, 'hidden')).toBe(
      false
    );
  });
  scope.stop();
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
  const scope = effectScope();
  scope.run(() => {
    const selectors = useStore({ autoSelector: true });
    expect(selectors.nested.count.value).toBe(0);
    selectors.increment();
    expect(selectors.nested.count.value).toBe(1);
  });
  scope.stop();
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
  const scope = effectScope();
  scope.run(() => {
    const selectors = useStore({ autoSelector: true });
    expect(selectors.stamp.value).toBe(initialStamp);
    selectors.replaceStamp();
    expect(selectors.stamp.value).toBe(nextStamp);
  });
  scope.stop();
});

test('autoSelector types non-plain object values as leaf refs', () => {
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
  expectTypeOf(selectors.stamp).toEqualTypeOf<ComputedRef<Date>>();
  expectTypeOf(selectors.nested.stamp).toEqualTypeOf<ComputedRef<Date>>();
});

test('autoSelector includes symbol keyed state and slices', () => {
  const valueKey = Symbol('vue-value');
  const sliceKey = Symbol('vue-slice');
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
  const scope = effectScope();
  scope.run(() => {
    const selectors = useStore({ autoSelector: true });
    const sliceSelectors = useSliceStore({ autoSelector: true });

    expect(Object.getOwnPropertySymbols(selectors)).toContain(valueKey);
    expect(selectors[valueKey].value).toBe(1);
    expect(Object.getOwnPropertySymbols(sliceSelectors)).toContain(sliceKey);
    expect(sliceSelectors[sliceKey].count.value).toBe(2);
  });
  scope.stop();
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
  expect(() => {
    (state as any).count = 1;
  }).toThrow(
    'Direct state mutation is not allowed in immutable Coaction stores.'
  );
  expect(() => {
    (state as any).unknown = 1;
  }).toThrow(TypeError);
  expect(() => {
    delete (state as any).count;
  }).toThrow(TypeError);
  expect(() => {
    delete (state as any).unknown;
  }).toThrow("Unknown state key 'unknown' cannot be deleted.");
  expect(() => {
    Object.defineProperty(state, 'count', {
      value: 1
    });
  }).toThrow(
    'Direct state mutation is not allowed in immutable Coaction stores.'
  );
  expect(() => {
    Object.setPrototypeOf(state, {
      polluted: true
    });
  }).toThrow(
    'Direct state mutation is not allowed in immutable Coaction stores.'
  );
  expect(state.count).toBe(0);
  expect((state as any).unknown).toBeUndefined();
  useStore.destroy();
});

test('state proxy returns stable actions with latest state binding', () => {
  const useStore = create<{
    count: number;
    increment: () => void;
    readCount: () => number;
  }>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    },
    readCount() {
      return this.count;
    }
  }));
  const state = useStore();
  const increment = state.increment;
  const readCount = state.readCount;
  expect(state.increment).toBe(increment);
  expect(state.readCount).toBe(readCount);
  expect(readCount()).toBe(0);
  increment();
  expect(readCount()).toBe(1);
  expect(state.increment).toBe(increment);
  expect(state.readCount).toBe(readCount);
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
    const selectors = useStore({ autoSelector: true }) as any;
    expect(selectors.counter.count.value).toBe(0);
    expect(
      Object.prototype.hasOwnProperty.call(selectors, protoKey)
    ).toBeFalsy();
  } finally {
    delete (Object.prototype as any)[protoKey];
  }
});
