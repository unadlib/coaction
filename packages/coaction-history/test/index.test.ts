import { create } from 'coaction/shared';
import { makeAutoObservable } from 'mobx';
import { vi } from 'vitest';
import { bindMobx } from '../../coaction-mobx/src';
import { history } from '../src';

test('throws when used with a client store mirror', () => {
  expect(() => {
    create(
      () => ({
        count: 0
      }),
      {
        name: 'history-client-mirror',
        clientTransport: {
          dispose: () => undefined,
          emit: () => Promise.resolve(undefined),
          listen: () => undefined,
          onConnect: () => undefined
        } as any,
        middlewares: [history()]
      }
    );
  }).toThrow(
    'history() is not supported in client store mode. Apply history() to the main shared store instead.'
  );
});

test('undo and redo', () => {
  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;
  useStore.getState().increment();
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(2);
  expect(api.canUndo()).toBeTruthy();
  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().count).toBe(1);
  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().count).toBe(0);
  expect(api.undo()).toBeFalsy();
  expect(api.canRedo()).toBeTruthy();
  expect(api.redo()).toBeTruthy();
  expect(useStore.getState().count).toBe(1);
  expect(api.redo()).toBeTruthy();
  expect(useStore.getState().count).toBe(2);
  expect(api.redo()).toBeFalsy();
});

test('records mutable adapter updates from the core commit feed', () => {
  const useStore = create(
    () =>
      makeAutoObservable(
        bindMobx({
          count: 0,
          increment() {
            this.count += 1;
          }
        })
      ),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().increment();

  expect(api.canUndo()).toBeTruthy();
  expect(api.getPast()).toEqual([
    {
      count: 0
    }
  ]);
  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().count).toBe(0);
});

test('undo and redo restore deleted object keys', () => {
  const useStore = create(
    (set) => ({
      data: {
        keep: 1,
        remove: 2
      },
      removeKey() {
        set((draft) => {
          delete draft.data.remove;
        });
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().removeKey();
  expect(useStore.getState().data).toEqual({
    keep: 1
  });

  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().data).toEqual({
    keep: 1,
    remove: 2
  });

  expect(api.redo()).toBeTruthy();
  expect(useStore.getState().data).toEqual({
    keep: 1
  });
});

test('undo and redo restore root key removal from replacement apply', () => {
  const useStore = create(
    () => ({
      a: 1,
      b: 2
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;

  useStore.apply({
    a: 1
  } as any);
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getPureState(), 'b')
  ).toBe(false);

  expect(api.undo()).toBeTruthy();
  expect(useStore.getPureState()).toEqual({
    a: 1,
    b: 2
  });

  expect(api.redo()).toBeTruthy();
  expect(useStore.getPureState()).toEqual({
    a: 1
  });
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getPureState(), 'b')
  ).toBe(false);
});

test('local undo and redo run root replacement through patch pipeline', () => {
  const patch = vi.fn((options: any) => options);
  const patchMiddleware = (store: any) => {
    store.patch = patch;
    return store;
  };
  const useStore = create(
    () => ({
      a: 1,
      b: 2
    }),
    {
      middlewares: [patchMiddleware, history()]
    }
  );
  const api = (useStore as any).history;

  useStore.apply({
    a: 1
  } as any);

  patch.mockClear();
  expect(api.undo()).toBeTruthy();

  expect(useStore.getPureState()).toEqual({
    a: 1,
    b: 2
  });
  expect(patch).toHaveBeenCalledTimes(1);
  expect(patch.mock.calls[0][0].patches).toEqual([
    {
      op: 'add',
      path: ['b'],
      value: 2
    }
  ]);

  patch.mockClear();
  expect(api.redo()).toBeTruthy();

  expect(useStore.getPureState()).toEqual({
    a: 1
  });
  expect(patch).toHaveBeenCalledTimes(1);
  expect(patch.mock.calls[0][0].patches).toEqual([
    {
      op: 'remove',
      path: ['b']
    }
  ]);
});

test('local undo honors in-place root replacement patch transforms', () => {
  const patch = vi.fn((options: any) => {
    options.patches[0].value = 3;
    return options;
  });
  const patchMiddleware = (store: any) => {
    store.patch = patch;
    return store;
  };
  const useStore = create(
    () => ({
      a: 1,
      b: 2
    }),
    {
      middlewares: [patchMiddleware, history()]
    }
  );
  const api = (useStore as any).history;

  useStore.apply({
    a: 1
  } as any);

  patch.mockClear();
  expect(api.undo()).toBeTruthy();

  expect(patch).toHaveBeenCalledTimes(1);
  expect(useStore.getPureState()).toEqual({
    a: 1,
    b: 3
  });
});

test('local undo with identity patch hook preserves array properties', () => {
  const tag = Symbol('history-patch-array-tag');
  type SparseArray = any[] & Record<PropertyKey, any>;
  const makeList = (label: string, includeUndefined: boolean) => {
    const list = [] as SparseArray;
    list.length = 1;
    if (includeUndefined) {
      list[0] = undefined;
    }
    list.label = label;
    list[tag] = label;
    return list;
  };
  const patch = vi.fn((options: any) => options);
  const patchMiddleware = (store: any) => {
    store.patch = patch;
    return store;
  };
  const useStore = create(
    (set) => ({
      list: makeList('before', false),
      replaceList() {
        set({
          list: makeList('after', true)
        } as any);
      }
    }),
    {
      middlewares: [patchMiddleware, history()]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().replaceList();
  patch.mockClear();

  expect(api.undo()).toBeTruthy();
  const undone = useStore.getState().list as SparseArray;
  expect(patch).toHaveBeenCalledTimes(1);
  expect(undone.length).toBe(1);
  expect(Object.prototype.hasOwnProperty.call(undone, 0)).toBe(false);
  expect(undone.label).toBe('before');
  expect(undone[tag]).toBe('before');
});

test('undo and redo restore array truncation', () => {
  const useStore = create(
    (set) => ({
      list: [1, 2, 3],
      popItem() {
        set((draft) => {
          draft.list.pop();
        });
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().popItem();
  expect(useStore.getState().list).toEqual([1, 2]);

  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().list).toEqual([1, 2, 3]);

  expect(api.redo()).toBeTruthy();
  expect(useStore.getState().list).toEqual([1, 2]);
});

test('undo and redo preserve sparse array holes and properties', () => {
  const tag = Symbol('array-tag');
  type SparseArray = any[] & Record<PropertyKey, any>;
  const makeList = (label: string, includeUndefined: boolean) => {
    const list = [] as SparseArray;
    list.length = 1;
    if (includeUndefined) {
      list[0] = undefined;
    }
    list.label = label;
    list[tag] = label;
    return list;
  };
  const useStore = create(
    (set) => ({
      list: makeList('before', false),
      replaceList() {
        set({
          list: makeList('after', true)
        } as any);
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().replaceList();

  const pastList = api.getPast()[0].list as SparseArray;
  expect(pastList.length).toBe(1);
  expect(Object.prototype.hasOwnProperty.call(pastList, 0)).toBe(false);
  expect(pastList.label).toBe('before');
  expect(pastList[tag]).toBe('before');

  expect(api.undo()).toBeTruthy();
  const undone = useStore.getState().list as SparseArray;
  expect(undone.length).toBe(1);
  expect(Object.prototype.hasOwnProperty.call(undone, 0)).toBe(false);
  expect(undone.label).toBe('before');
  expect(undone[tag]).toBe('before');

  expect(api.redo()).toBeTruthy();
  const redone = useStore.getState().list as SparseArray;
  expect(redone.length).toBe(1);
  expect(Object.prototype.hasOwnProperty.call(redone, 0)).toBe(true);
  expect(redone[0]).toBeUndefined();
  expect(redone.label).toBe('after');
  expect(redone[tag]).toBe('after');
});

test('undo and redo track symbol keyed state', () => {
  const token = Symbol('history-token');
  const useStore = create(
    (set) => ({
      [token]: 1,
      setToken(value: number) {
        set({
          [token]: value
        } as any);
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().setToken(2);

  expect(api.canUndo()).toBeTruthy();
  expect(api.getPast()[0][token]).toBe(1);
  expect((useStore.getState() as any)[token]).toBe(2);

  expect(api.undo()).toBeTruthy();
  expect((useStore.getState() as any)[token]).toBe(1);

  expect(api.redo()).toBeTruthy();
  expect((useStore.getState() as any)[token]).toBe(2);
});

test('undo and redo preserve non-record object values', () => {
  const before = new Date('2026-01-01T00:00:00.000Z');
  const after = new Date('2026-01-02T00:00:00.000Z');
  const useStore = create(
    (set) => ({
      stamp: before,
      setStamp(stamp: Date) {
        set({
          stamp
        });
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().setStamp(after);

  expect(api.getPatches()).toBeUndefined();
  expect(api.getPast()[0].stamp).toBe(before);
  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().stamp).toBe(before);
  expect(api.redo()).toBeTruthy();
  expect(useStore.getState().stamp).toBe(after);
});

test('undo and redo preserve circular and shared root references', () => {
  const beforeShared = {
    value: 0
  };
  const before = {
    count: 0,
    left: beforeShared,
    right: beforeShared
  } as any;
  before.self = before;
  const afterShared = {
    value: 1
  };
  const after = {
    count: 1,
    left: afterShared,
    right: afterShared
  } as any;
  after.self = after;
  const useStore = create(
    () => ({
      count: -1,
      left: null as any,
      right: null as any,
      self: null as any
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;

  useStore.setState(before);
  api.clear();
  useStore.setState(after);

  expect(api.undo()).toBeTruthy();
  const undone = useStore.getPureState() as any;
  expect(undone.self).toBe(undone);
  expect(undone.left).toBe(undone.right);
  expect(undone.left).toEqual({
    value: 0
  });

  expect(api.redo()).toBeTruthy();
  const redone = useStore.getPureState() as any;
  expect(redone.self).toBe(redone);
  expect(redone.left).toBe(redone.right);
  expect(redone.left).toEqual({
    value: 1
  });
});

test.each(['object', 'recipe'] as const)(
  'actions switch dynamic cyclic %s updates to snapshot compatibility',
  (updateKind) => {
    type Graph = Record<string, unknown>;
    const useStore = create(
      (set) => ({
        value: null as Graph | null,
        setValue(value: Graph | null) {
          if (updateKind === 'object') {
            set({ value });
            return;
          }
          set((draft) => {
            draft.value = value;
          });
        }
      }),
      {
        middlewares: [history()]
      }
    );
    const api = (useStore as any).history;
    const first: Graph = { label: 'first' };
    first.self = first;
    const second: Graph = { label: 'second' };
    second.self = second;

    expect(() => useStore.getState().setValue(first)).not.toThrow();
    useStore.getState().setValue(second);

    expect(api.getPatches()).toBeUndefined();
    expect(api.undo()).toBeTruthy();
    expect(useStore.getState().value!.self).toBe(useStore.getState().value);
    expect(useStore.getState().value!.label).toBe('first');
    expect(api.undo()).toBeTruthy();
    expect(useStore.getState().value).toBeNull();
    expect(api.redo()).toBeTruthy();
    expect(useStore.getState().value!.self).toBe(useStore.getState().value);
  }
);

test('dynamic cyclic actions leave the patch pipeline before application', () => {
  const patch = vi.fn((options: any) => options);
  const patchMiddleware = (store: any) => {
    store.patch = patch;
    return store;
  };
  const useStore = create(
    (set) => ({
      value: null as Record<string, unknown> | null,
      setValue(value: Record<string, unknown>) {
        set((draft) => {
          draft.value = value;
        });
      }
    }),
    {
      middlewares: [patchMiddleware, history()]
    }
  );
  const api = (useStore as any).history;
  const value: Record<string, unknown> = { label: 'cyclic' };
  value.self = value;

  expect(() => useStore.getState().setValue(value)).not.toThrow();

  expect(patch).toHaveBeenCalledTimes(1);
  expect(api.getPatches()).toBeUndefined();
  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().value).toBeNull();
});

test('snapshot compatibility preserves aliases introduced across patch paths', () => {
  const useStore = create(
    (set) => ({
      left: null as Record<string, unknown> | null,
      right: null as Record<string, unknown> | null,
      shareValue() {
        const shared = { label: 'shared' };
        set((draft) => {
          draft.left = shared;
          draft.right = shared;
        });
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().shareValue();

  expect(useStore.getState().left).toBe(useStore.getState().right);
  expect(api.getPatches()).toBeUndefined();
  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().left).toBeNull();
  expect(api.redo()).toBeTruthy();
  expect(useStore.getState().left).toBe(useStore.getState().right);
});

test('partialized undo and redo replace non-record object values', () => {
  const before = new Date('2026-01-01T00:00:00.000Z');
  const after = new Date('2026-01-02T00:00:00.000Z');
  const useStore = create(
    (set) => ({
      nested: {
        stamp: before,
        keep: 'yes'
      },
      setStamp(stamp: Date) {
        set((draft) => {
          draft.nested.stamp = stamp;
        });
      }
    }),
    {
      middlewares: [
        history({
          partialize: (state) => ({
            nested: {
              stamp: state.nested.stamp
            }
          })
        })
      ]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().setStamp(after);

  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().nested.stamp).toBe(before);
  expect(useStore.getState().nested.keep).toBe('yes');
  expect(api.redo()).toBeTruthy();
  expect(useStore.getState().nested.stamp).toBe(after);
  expect(useStore.getState().nested.keep).toBe('yes');
});

test('partialized undo and redo preserve circular and shared references', () => {
  const makeTracked = (value: number) => {
    const shared = {
      value
    };
    const tracked = {
      left: shared,
      right: shared
    } as any;
    tracked.self = tracked;
    return tracked;
  };
  const useStore = create(
    (set) => ({
      tracked: makeTracked(0),
      keep: 'yes',
      replaceTracked(tracked: object) {
        set({
          tracked
        });
      },
      setKeep(keep: string) {
        set({
          keep
        });
      }
    }),
    {
      middlewares: [
        history({
          partialize: (state) => ({
            tracked: state.tracked
          })
        })
      ]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().replaceTracked(makeTracked(1));
  useStore.getState().setKeep('changed');

  expect(api.undo()).toBeTruthy();
  const undone = useStore.getPureState() as any;
  expect(undone.keep).toBe('changed');
  expect(undone.tracked.self).toBe(undone.tracked);
  expect(undone.tracked.left).toBe(undone.tracked.right);
  expect(undone.tracked.left).toEqual({
    value: 0
  });

  expect(api.redo()).toBeTruthy();
  const redone = useStore.getPureState() as any;
  expect(redone.keep).toBe('changed');
  expect(redone.tracked.self).toBe(redone.tracked);
  expect(redone.tracked.left).toBe(redone.tracked.right);
  expect(redone.tracked.left).toEqual({
    value: 1
  });
});

test('respects history limit', () => {
  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        history({
          limit: 1
        })
      ]
    }
  );
  const api = (useStore as any).history;
  useStore.getState().increment();
  useStore.getState().increment();
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(3);
  expect(api.getPast()).toHaveLength(1);
  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().count).toBe(2);
  expect(api.undo()).toBeFalsy();
});

test('rejects invalid history limits', () => {
  for (const limit of [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY]) {
    expect(() => {
      create(
        () => ({
          count: 0
        }),
        {
          middlewares: [
            history({
              limit
            })
          ]
        }
      );
    }).toThrow('history limit must be a non-negative integer.');
  }
});

test('supports zero history limit', () => {
  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        history({
          limit: 0
        })
      ]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().increment();

  expect(api.getPast()).toHaveLength(0);
  expect(api.undo()).toBeFalsy();
  expect(useStore.getState().count).toBe(1);
});

test('clear history and partialize', () => {
  const useStore = create(
    (set) => ({
      count: 0,
      name: 'coaction',
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      },
      rename(name: string) {
        set({
          name
        });
      }
    }),
    {
      middlewares: [
        history({
          partialize: (state) => ({
            count: state.count
          })
        })
      ]
    }
  );
  const api = (useStore as any).history;
  useStore.getState().increment();
  useStore.getState().rename('next');
  expect(useStore.getState().count).toBe(1);
  expect(useStore.getState().name).toBe('next');
  // name change is ignored because of partialize.
  expect(api.getPast()).toHaveLength(1);
  api.clear();
  expect(api.canUndo()).toBeFalsy();
  expect(api.getPast()).toHaveLength(0);
  expect(api.getFuture()).toHaveLength(0);
});

test('nested partialize preserves untracked sibling keys during undo and redo', () => {
  const useStore = create(
    (set) => ({
      nested: {
        tracked: 0,
        keep: 'yes'
      },
      increment() {
        set((draft) => {
          draft.nested.tracked += 1;
        });
      },
      setKeep(value: string) {
        set((draft) => {
          draft.nested.keep = value;
        });
      }
    }),
    {
      middlewares: [
        history({
          partialize: (state) => ({
            nested: {
              tracked: state.nested.tracked
            }
          })
        })
      ]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().increment();
  useStore.getState().setKeep('changed');

  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().nested).toEqual({
    tracked: 0,
    keep: 'changed'
  });

  expect(api.redo()).toBeTruthy();
  expect(useStore.getState().nested).toEqual({
    tracked: 1,
    keep: 'changed'
  });
});

test('partialize excludes circular untracked state from the patch journal', () => {
  const circular: Record<string, unknown> = { label: 'untracked' };
  circular.self = circular;
  const useStore = create(
    (set) => ({
      count: 0,
      circular,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        history({
          partialize: (state) => ({ count: state.count })
        })
      ]
    }
  );
  const api = (useStore as any).history;
  const untrackedReference = useStore.getState().circular;

  useStore.getState().increment();
  expect(api.undo()).toBe(true);
  expect(useStore.getState().count).toBe(0);
  expect(useStore.getState().circular).toBe(untrackedReference);
  expect(api.redo()).toBe(true);
  expect(useStore.getState().count).toBe(1);
  expect(useStore.getState().circular).toBe(untrackedReference);
});

test('partialize snapshots ignore unsafe prototype keys', () => {
  const useStore = create(
    (set) => ({
      count: 0,
      nested: {
        value: 0
      },
      increment() {
        set((draft) => {
          draft.count += 1;
          draft.nested.value += 1;
        });
      }
    }),
    {
      middlewares: [
        history({
          partialize: (state) =>
            JSON.parse(
              `{"count":${state.count},"nested":{"value":${state.nested.value},"__proto__":{"nested":true},"constructor":{"value":2}},"__proto__":{"polluted":true},"prototype":{"value":3}}`
            )
        })
      ]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().increment();
  const past = api.getPast()[0];

  expect(Object.getPrototypeOf(past)).toBe(Object.prototype);
  expect(Object.getPrototypeOf(past.nested)).toBe(Object.prototype);
  expect(Object.prototype.hasOwnProperty.call(past, '__proto__')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(past, 'prototype')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(past.nested, '__proto__')).toBe(
    false
  );
  expect(Object.prototype.hasOwnProperty.call(past.nested, 'constructor')).toBe(
    false
  );

  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().count).toBe(0);
  expect(useStore.getState().nested).toEqual({
    value: 0
  });
  expect(Object.getPrototypeOf(useStore.getPureState())).toBe(Object.prototype);
  expect(Object.getPrototypeOf(useStore.getPureState().nested)).toBe(
    Object.prototype
  );
});

test('snapshot strips functions and keeps array structure', () => {
  const useStore = create(
    (set) => ({
      items: [
        {
          value: 0,
          fn() {
            return this.value;
          }
        }
      ],
      update() {
        set({
          items: [
            {
              value: 1,
              fn() {
                return this.value;
              }
            }
          ]
        } as any);
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;
  useStore.getState().update();
  expect(api.getPast()).toMatchInlineSnapshot(`
[
  {
    "items": [
      {
        "value": 0,
      },
    ],
  },
]
  `);
});

test('history snapshot getters do not expose mutable internal stacks', () => {
  const useStore = create(
    (set) => ({
      count: 0,
      setCount(count: number) {
        set({
          count
        });
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;

  useStore.getState().setCount(1);
  const past = api.getPast();
  past[0].count = 999;

  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().count).toBe(0);

  const future = api.getFuture();
  future[0].count = 999;

  expect(api.redo()).toBeTruthy();
  expect(useStore.getState().count).toBe(1);
});

test('time traveling setState does not clear redo stack', () => {
  let state = {
    count: 0
  };
  const store = {
    getPureState: () => state,
    setState(next: any) {
      if (typeof next === 'function') {
        const draft = {
          ...state
        };
        next(draft);
        state = draft;
      } else {
        state = next;
      }
      if (state.count === 0) {
        store.setState({
          count: 999
        });
      }
      return [];
    }
  } as any;
  history()(store);
  const api = store.history;
  store.setState({
    count: 1
  });
  expect(api.canUndo()).toBeTruthy();
  expect(api.undo()).toBeTruthy();
  expect(state.count).toBe(999);
  expect(api.canRedo()).toBeTruthy();
});

test('supports cyclic snapshots without stack overflow', () => {
  const self: any = {};
  self.self = self;
  const useStore = create(
    (set) => ({
      count: 0,
      loop: self,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;
  expect(() => {
    useStore.getState().increment();
  }).not.toThrow();
  expect(api.getPast()).toHaveLength(1);
  const past = api.getPast()[0] as any;
  expect(past.loop.self).toBe(past.loop);
});

test('compares unchanged cyclic snapshots safely', () => {
  const self: any = {};
  self.self = self;
  const useStore = create(
    (set) => ({
      count: 0,
      loop: self,
      noop() {
        set((draft) => {
          draft.count += 0;
        });
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;
  expect(() => {
    useStore.getState().noop();
  }).not.toThrow();
  expect(api.getPast()).toHaveLength(0);
});

test('snapshot only includes own enumerable properties', () => {
  const proto = {
    inherited: 1
  };
  const data = Object.create(proto) as {
    own: number;
    inherited?: number;
  };
  data.own = 0;
  const useStore = create(
    (set) => ({
      data,
      bump() {
        set((draft) => {
          draft.data.own += 1;
        });
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;
  useStore.getState().bump();
  const past = api.getPast()[0] as any;
  expect(past.data).toEqual({
    own: 0
  });
  expect(past.data.inherited).toBeUndefined();
});

test('patch updates and lazy getters avoid full-state snapshots', () => {
  let getPureState: ReturnType<typeof jest.fn>;
  const trackPureStateReads = (store: any) => {
    getPureState = jest.fn(store.getPureState);
    store.getPureState = getPureState;
    return store;
  };
  const useStore = create(
    (set) => ({
      count: 0,
      unchanged: Array.from({ length: 1000 }, (_, index) => ({ index })),
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [history(), trackPureStateReads]
    }
  );
  const api = (useStore as any).history;
  getPureState!.mockClear();

  useStore.getState().increment();
  useStore.getState().increment();

  expect(api.canUndo()).toBe(true);
  expect(getPureState!).not.toHaveBeenCalled();

  const patches = api.getPatches();
  expect(patches.position).toBe(2);
  expect(patches.patches).toHaveLength(2);
  expect(patches.inversePatches).toHaveLength(2);
  expect(getPureState!).not.toHaveBeenCalled();

  expect(api.getPast().map((state: any) => state.count)).toEqual([0, 1]);
  expect(getPureState!).not.toHaveBeenCalled();
});
