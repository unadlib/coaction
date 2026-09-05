import { create } from 'coaction/shared';
import * as Y from 'yjs';
import { history } from '../../coaction-history/src';
import { bindYjs, yjs } from '../src';

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const waitFor = async (assertion: () => void, timeout = 1000) => {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeout) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await wait(10);
    }
  }
  throw lastError;
};

const readYValue = (value: unknown): unknown => {
  if (value instanceof Y.Map) {
    const next: Record<string, unknown> = {};
    value.forEach((item, key) => {
      next[key] = readYValue(item);
    });
    return next;
  }
  if (value instanceof Y.Array) {
    return value.toArray().map((item) => readYValue(item));
  }
  return value;
};

const readState = (doc: Y.Doc, key = 'counter') => {
  const state = doc.getMap<any>(key).get('state');
  return readYValue(state) as Record<string, unknown>;
};

const connectDocs = (docA: Y.Doc, docB: Y.Doc) => {
  const providerA = {
    id: 'provider-a'
  };
  const providerB = {
    id: 'provider-b'
  };
  let aToB = 0;
  let bToA = 0;
  const onA = (update: Uint8Array, origin: unknown) => {
    if (origin === providerA) {
      return;
    }
    aToB += 1;
    setTimeout(() => {
      Y.applyUpdate(docB, update, providerB);
    }, 0);
  };
  const onB = (update: Uint8Array, origin: unknown) => {
    if (origin === providerB) {
      return;
    }
    bToA += 1;
    setTimeout(() => {
      Y.applyUpdate(docA, update, providerA);
    }, 0);
  };
  docA.on('update', onA);
  docB.on('update', onB);
  return {
    counts: () => ({
      aToB,
      bToA
    }),
    disconnect: () => {
      docA.off('update', onA);
      docB.off('update', onB);
    }
  };
};

const createTransportPair = () => {
  const mainListeners = new Map<string, (...args: any[]) => unknown>();
  const clientListeners = new Map<string, (...args: any[]) => unknown>();
  const runAsync = (callback: () => void) => {
    setTimeout(callback, 0);
  };
  return {
    main: {
      listen: (name: string, listener: (...args: any[]) => unknown) => {
        mainListeners.set(name, listener);
      },
      emit: (event: string | { name: string }, payload?: unknown) => {
        const name = typeof event === 'string' ? event : event.name;
        if (name === 'update') {
          return Promise.resolve(clientListeners.get('update')?.(payload));
        }
        return Promise.resolve(undefined);
      },
      onConnect: (callback: () => void) => {
        runAsync(callback);
      },
      dispose: () => undefined
    },
    client: {
      listen: (name: string, listener: (...args: any[]) => unknown) => {
        clientListeners.set(name, listener);
      },
      emit: (name: string, ...args: unknown[]) => {
        const listener = mainListeners.get(name);
        if (!listener) {
          return Promise.reject(new Error(`Missing listener: ${name}`));
        }
        return Promise.resolve(listener(...args));
      },
      onConnect: (callback: () => void) => {
        runAsync(callback);
      },
      dispose: () => undefined
    }
  };
};

test('syncs state from coaction to yjs', () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  expect(readState(doc, 'counter')).toEqual({
    count: 0
  });
  store.getState().increment();
  expect(readState(doc, 'counter')).toEqual({
    count: 1
  });
  binding.destroy();
});

test('rejects symbol keyed state during binding', () => {
  const symbolKey = Symbol('yjs-state');
  const store = create(
    () =>
      ({
        [symbolKey]: 1,
        count: 0
      }) as any
  );

  expect(() => bindYjs(store)).toThrow(
    'Yjs binding does not support symbol-keyed state because Y.Map keys are strings. Found symbol key at Symbol(yjs-state).'
  );
});

test('rejects symbol valued state during binding', () => {
  const store = create(() => ({
    nested: {
      value: Symbol('yjs-value')
    }
  }));

  expect(() => bindYjs(store)).toThrow(
    'Yjs binding does not support symbol-valued state because symbols cannot be cloned into Yjs documents. Found symbol value at nested.value.'
  );
});

test('rejects function valued state during binding', () => {
  const store = create(() => ({
    nested: {
      value() {
        return 1;
      }
    }
  }));

  expect(() => bindYjs(store)).toThrow(
    'Yjs binding does not support function state because only plain objects, arrays, and primitive values round-trip through Yjs updates. Found unsupported value at nested.value.'
  );
});

test('rejects non-plain object state during binding', () => {
  const store = create(() => ({
    stamp: new Date('2024-01-01T00:00:00.000Z')
  }));

  expect(() => bindYjs(store)).toThrow(
    'Yjs binding does not support non-plain-object state because only plain objects, arrays, and primitive values round-trip through Yjs updates. Found unsupported value at stamp.'
  );
});

test('rejects symbol keyed state during later sync', () => {
  const symbolKey = Symbol('yjs-late-state');
  const store = create(() => ({
    nested: {}
  })) as any;
  const binding = bindYjs(store);

  try {
    expect(() => {
      store.setState({
        nested: {
          [symbolKey]: 1
        }
      });
    }).toThrow(
      'Yjs binding does not support symbol-keyed state because Y.Map keys are strings. Found symbol key at nested.Symbol(yjs-late-state).'
    );
  } finally {
    binding.destroy();
  }
});

test('rejects symbol valued state during later sync', () => {
  const store = create(() => ({
    nested: {
      value: 0 as number | symbol
    }
  }));
  const binding = bindYjs(store);

  try {
    expect(() => {
      store.setState({
        nested: {
          value: Symbol('yjs-late-value')
        }
      });
    }).toThrow(
      'Yjs binding does not support symbol-valued state because symbols cannot be cloned into Yjs documents. Found symbol value at nested.value.'
    );
  } finally {
    binding.destroy();
  }
});

test('rejects function valued state during later sync', () => {
  const store = create(() => ({
    nested: {
      value: 0 as number | (() => number)
    }
  }));
  const binding = bindYjs(store);

  try {
    expect(() => {
      store.setState((draft) => {
        draft.nested.value = (() => 1) as any;
      });
    }).toThrow(
      'Yjs binding does not support function state because only plain objects, arrays, and primitive values round-trip through Yjs updates. Found unsupported value at nested.value.'
    );
  } finally {
    binding.destroy();
  }
});

test('rejects non-plain object state during later sync', () => {
  const doc = new Y.Doc();
  const store = create(() => ({
    stamp: null as Date | null
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });

  try {
    expect(() => {
      store.setState({
        stamp: new Date('2024-01-01T00:00:00.000Z')
      });
    }).toThrow(
      'Yjs binding does not support non-plain-object state because only plain objects, arrays, and primitive values round-trip through Yjs updates. Found unsupported value at stamp.'
    );
    expect(store.getState().stamp).toBeNull();
    expect(store.getPureState().stamp).toBeNull();
    expect(readState(doc, 'counter')).toEqual({
      stamp: null
    });
  } finally {
    binding.destroy();
  }
});

test('syncs state from yjs to coaction', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const map = doc.getMap<any>('counter');
  const state = map.get('state') as Y.Map<any>;
  doc.transact(() => {
    state.set('count', 8);
  }, 'external');
  await waitFor(() => {
    expect(store.getState().count).toBe(8);
  });
  binding.destroy();
});

test('removes own root key when remote yjs state deletes it', async () => {
  const doc = new Y.Doc();
  const store = create(() => ({
    count: 1
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const map = doc.getMap<any>('counter');
  const state = map.get('state') as Y.Map<any>;

  doc.transact(() => {
    state.delete('count');
  }, 'external');

  await waitFor(() => {
    expect(store.getState().count).toBeUndefined();
    expect(
      Object.prototype.hasOwnProperty.call(store.getPureState(), 'count')
    ).toBe(false);
  });
  binding.destroy();
});

test('hydrates store from existing yjs state', () => {
  const doc = new Y.Doc();
  const map = doc.getMap<any>('counter');
  const state = new Y.Map<any>();
  state.set('count', 12);
  map.set('state', state);
  const store = create((set) => ({
    count: 0
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  expect(store.getState().count).toBe(12);
  binding.destroy();
});

test('hydrates existing yjs state as an exact replacement', () => {
  const doc = new Y.Doc();
  const map = doc.getMap<any>('counter');
  const state = new Y.Map<any>();
  state.set('a', 3);
  map.set('state', state);
  const store = create((set) => ({
    a: 1,
    b: 2
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });

  expect(store.getPureState()).toEqual({
    a: 3
  });
  binding.destroy();
});

test('rejects existing yjs state with unknown schema keys and restores local state', () => {
  const doc = new Y.Doc();
  const map = doc.getMap<any>('counter');
  const state = new Y.Map<any>();
  state.set('count', 12);
  state.set('extra', 1);
  map.set('state', state);
  const store = create(() => ({
    count: 0
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });

  expect(store.getState().count).toBe(0);
  expect(readState(doc, 'counter')).toEqual({
    count: 0
  });
  binding.destroy();
});

test('rejects existing yjs non-plain snapshot and restores local state', () => {
  const doc = new Y.Doc();
  const map = doc.getMap<any>('counter');
  const state = new Y.Map<any>();
  const nested = new Y.Map<any>();
  nested.set('stamp', new Date('2024-02-01T00:00:00.000Z'));
  state.set('nested', nested);
  map.set('state', state);
  const store = create(() => ({
    count: 0,
    nested: {
      stamp: null as Date | null
    }
  }));

  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });

  expect(store.getState().nested.stamp).toBeNull();
  expect(readState(doc, 'counter')).toEqual({
    count: 0,
    nested: {
      stamp: null
    }
  });
  binding.destroy();
});

test('rejects remote yjs non-plain map value and keeps binding usable', async () => {
  const doc = new Y.Doc();
  const store = create(() => ({
    count: 0,
    stamp: null as Date | null
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  let state = doc.getMap<any>('counter').get('state') as Y.Map<any>;

  doc.transact(() => {
    state.set('stamp', new Date('2024-01-01T00:00:00.000Z'));
  }, 'external');

  await waitFor(() => {
    expect(store.getState().stamp).toBeNull();
    expect(readState(doc, 'counter')).toEqual({
      count: 0,
      stamp: null
    });
  });

  state = doc.getMap<any>('counter').get('state') as Y.Map<any>;
  doc.transact(() => {
    state.set('count', 2);
  }, 'external');

  await waitFor(() => {
    expect(store.getState().count).toBe(2);
  });
  expect(readState(doc, 'counter')).toEqual({
    count: 2,
    stamp: null
  });
  binding.destroy();
});

test('rejects remote yjs updates with unknown schema keys and restores yjs state', async () => {
  const doc = new Y.Doc();
  const store = create(() => ({
    count: 0
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  let state = doc.getMap<any>('counter').get('state') as Y.Map<any>;

  doc.transact(() => {
    state.set('extra', 1);
  }, 'external');

  await waitFor(() => {
    expect(store.getState().count).toBe(0);
    expect(readState(doc, 'counter')).toEqual({
      count: 0
    });
  });

  state = doc.getMap<any>('counter').get('state') as Y.Map<any>;
  doc.transact(() => {
    state.set('count', 2);
  }, 'external');

  await waitFor(() => {
    expect(store.getState().count).toBe(2);
  });
  expect(readState(doc, 'counter')).toEqual({
    count: 2
  });
  binding.destroy();
});

test('rejects remote yjs non-plain array value and restores yjs state', async () => {
  const doc = new Y.Doc();
  const store = create(() => ({
    items: [
      {
        stamp: null as Date | null
      }
    ]
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const state = doc.getMap<any>('counter').get('state') as Y.Map<any>;
  const items = state.get('items') as Y.Array<any>;
  const invalidItem = new Y.Map<any>();
  invalidItem.set('stamp', new Date('2024-01-01T00:00:00.000Z'));

  doc.transact(() => {
    items.delete(0, 1);
    items.insert(0, [invalidItem]);
  }, 'external');

  await waitFor(() => {
    expect(store.getState().items).toEqual([
      {
        stamp: null
      }
    ]);
    expect(readState(doc, 'counter')).toEqual({
      items: [
        {
          stamp: null
        }
      ]
    });
  });
  binding.destroy();
});

test('works as middleware', () => {
  const doc = new Y.Doc();
  const store = create(
    (set) => ({
      count: 1,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        yjs({
          doc,
          key: 'counter'
        })
      ]
    }
  );
  expect(readState(doc, 'counter')).toEqual({
    count: 1
  });
  store.getState().increment();
  expect(readState(doc, 'counter')).toEqual({
    count: 2
  });
});

test('middleware hydrates from existing yjs state during creation', () => {
  const doc = new Y.Doc();
  const root = doc.getMap<any>('counter');
  const remoteState = new Y.Map<any>();
  remoteState.set('count', 5);
  root.set('state', remoteState);

  const store = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        yjs({
          doc,
          key: 'counter'
        })
      ]
    }
  );

  expect(store.getState().count).toBe(5);
});

test('history ignores initial yjs hydration regardless of middleware order', () => {
  const createHydratedDoc = (key: string) => {
    const doc = new Y.Doc();
    const root = doc.getMap<any>(key);
    const state = new Y.Map<any>();
    state.set('count', 7);
    root.set('state', state);
    return doc;
  };
  const historyBeforeYjsDoc = createHydratedDoc('history-before-yjs');
  const historyBeforeYjs = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        history(),
        yjs({
          doc: historyBeforeYjsDoc,
          key: 'history-before-yjs'
        })
      ]
    }
  ) as any;

  expect(historyBeforeYjs.getState().count).toBe(7);
  expect(historyBeforeYjs.history.getPast()).toEqual([]);
  expect(historyBeforeYjs.history.undo()).toBe(false);
  expect(historyBeforeYjs.getState().count).toBe(7);
  expect(readState(historyBeforeYjsDoc, 'history-before-yjs')).toEqual({
    count: 7
  });

  const yjsBeforeHistoryDoc = createHydratedDoc('yjs-before-history');
  const yjsBeforeHistory = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        yjs({
          doc: yjsBeforeHistoryDoc,
          key: 'yjs-before-history'
        }),
        history()
      ]
    }
  ) as any;

  expect(yjsBeforeHistory.getState().count).toBe(7);
  expect(yjsBeforeHistory.history.getPast()).toEqual([]);
  expect(yjsBeforeHistory.history.undo()).toBe(false);
  expect(yjsBeforeHistory.getState().count).toBe(7);
  expect(readState(yjsBeforeHistoryDoc, 'yjs-before-history')).toEqual({
    count: 7
  });
});

test('throws in client share mode', () => {
  expect(() =>
    bindYjs({
      share: 'client'
    } as any)
  ).toThrow('Yjs binding is not supported in client store mode.');
});

test('ignores invalid incoming yjs state', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const map = doc.getMap<any>('counter');
  map.set('state', 123);
  await waitFor(() => {
    expect(map.get('state')).toBeInstanceOf(Y.Map);
  });
  expect(store.getState().count).toBe(0);

  store.setState({
    count: 1
  });

  await waitFor(() => {
    expect(readState(doc).count).toBe(1);
  });
  binding.destroy();
});

test('destroy cleans up internally created doc', () => {
  const store = create((set) => ({
    count: 0
  }));
  const binding = bindYjs(store);
  const spy = jest.spyOn(binding.doc, 'destroy');
  binding.destroy();
  expect(spy).toHaveBeenCalledTimes(1);
});

test('middleware destroy stops further syncing', () => {
  const doc = new Y.Doc();
  const store = create(
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
        yjs({
          doc,
          key: 'counter'
        })
      ]
    }
  );
  store.getState().increment();
  expect(readState(doc, 'counter')).toEqual({
    count: 1
  });
  store.destroy();
  expect(() => {
    store.getState().increment();
  }).toThrow('action increment cannot be called after store.destroy().');
  expect(readState(doc, 'counter')).toEqual({
    count: 1
  });
});

test('falls back to custom cloning without structuredClone', () => {
  const originalStructuredClone = globalThis.structuredClone;
  (globalThis as any).structuredClone = undefined;
  try {
    const doc = new Y.Doc();
    const store = create((set) => ({
      nested: {
        count: 0
      },
      increment() {
        set((draft) => {
          draft.nested.count += 1;
        });
      }
    }));
    const binding = bindYjs(store, {
      doc,
      key: 'counter'
    });
    store.getState().increment();
    expect(readState(doc, 'counter')).toEqual({
      nested: {
        count: 1
      }
    });
    binding.destroy();
  } finally {
    (globalThis as any).structuredClone = originalStructuredClone;
  }
});

test('fallback clone preserves Yjs primitive values without structuredClone', () => {
  const originalStructuredClone = globalThis.structuredClone;
  (globalThis as any).structuredClone = undefined;
  try {
    const doc = new Y.Doc();
    const store = create(() => ({
      missing: undefined,
      nan: Number.NaN,
      infinity: Infinity,
      negativeInfinity: -Infinity,
      big: BigInt(1),
      nested: {
        values: [Number.NaN, Infinity]
      }
    }));
    const binding = bindYjs(store, {
      doc,
      key: 'counter'
    });
    const state = readState(doc, 'counter');
    expect(Object.prototype.hasOwnProperty.call(state, 'missing')).toBe(true);
    expect(state.missing).toBeUndefined();
    expect(state.nan).toBeNaN();
    expect(state.infinity).toBe(Infinity);
    expect(state.negativeInfinity).toBe(-Infinity);
    expect(state.big).toBe(BigInt(1));
    expect((state.nested as any).values[0]).toBeNaN();
    expect((state.nested as any).values[1]).toBe(Infinity);
    binding.destroy();
  } finally {
    (globalThis as any).structuredClone = originalStructuredClone;
  }
});

test('ignores external updates that do not change state key', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const map = doc.getMap<any>('counter');
  doc.transact(() => {
    map.set('meta', {
      synced: true
    });
  }, 'external');
  await wait(20);
  expect(store.getState().count).toBe(0);
  binding.destroy();
});

test('syncs between two stores bound to same doc and key', async () => {
  const doc = new Y.Doc();
  const storeA = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      name: 'store-a'
    }
  );
  const storeB = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      name: 'store-b'
    }
  );
  const bindingA = bindYjs(storeA, {
    doc,
    key: 'counter'
  });
  const bindingB = bindYjs(storeB, {
    doc,
    key: 'counter'
  });
  storeA.getState().increment();
  await waitFor(() => {
    expect(storeB.getState().count).toBe(1);
  });
  bindingA.destroy();
  bindingB.destroy();
});

test('merges concurrent top-level updates across two docs', async () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const network = connectDocs(docA, docB);
  const storeA = create(
    (set) => ({
      count: 0,
      title: 'init',
      setCount(next: number) {
        set((draft) => {
          draft.count = next;
        });
      },
      setTitle(next: string) {
        set((draft) => {
          draft.title = next;
        });
      }
    }),
    {
      name: 'store-a'
    }
  );
  const storeB = create(
    (set) => ({
      count: 0,
      title: 'init',
      setCount(next: number) {
        set((draft) => {
          draft.count = next;
        });
      },
      setTitle(next: string) {
        set((draft) => {
          draft.title = next;
        });
      }
    }),
    {
      name: 'store-b'
    }
  );
  const bindingA = bindYjs(storeA, {
    doc: docA,
    key: 'counter'
  });
  const bindingB = bindYjs(storeB, {
    doc: docB,
    key: 'counter'
  });
  await waitFor(() => {
    expect(storeA.getState().count).toBe(0);
    expect(storeB.getState().count).toBe(0);
    expect(storeA.getState().title).toBe('init');
    expect(storeB.getState().title).toBe('init');
  });
  await wait(40);
  storeA.getState().setCount(1);
  storeB.getState().setTitle('remote');
  await waitFor(() => {
    expect(storeA.getState().count).toBe(1);
    expect(storeB.getState().count).toBe(1);
    expect(storeA.getState().title).toBe('remote');
    expect(storeB.getState().title).toBe('remote');
  });
  network.disconnect();
  bindingA.destroy();
  bindingB.destroy();
});

test('merges nested updates across two docs', async () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const network = connectDocs(docA, docB);
  const storeA = create(
    (set) => ({
      nested: {
        count: 0,
        flag: false
      },
      setCount(next: number) {
        set((draft) => {
          draft.nested.count = next;
        });
      },
      setFlag(next: boolean) {
        set((draft) => {
          draft.nested.flag = next;
        });
      }
    }),
    {
      name: 'nested-a'
    }
  );
  const storeB = create(
    (set) => ({
      nested: {
        count: 0,
        flag: false
      },
      setCount(next: number) {
        set((draft) => {
          draft.nested.count = next;
        });
      },
      setFlag(next: boolean) {
        set((draft) => {
          draft.nested.flag = next;
        });
      }
    }),
    {
      name: 'nested-b'
    }
  );
  const bindingA = bindYjs(storeA, {
    doc: docA,
    key: 'counter'
  });
  const bindingB = bindYjs(storeB, {
    doc: docB,
    key: 'counter'
  });
  await waitFor(() => {
    expect(storeA.getState().nested).toEqual({
      count: 0,
      flag: false
    });
    expect(storeB.getState().nested).toEqual({
      count: 0,
      flag: false
    });
  });
  await wait(40);
  storeA.getState().setCount(2);
  storeB.getState().setFlag(true);
  await waitFor(() => {
    expect(storeA.getState().nested).toEqual({
      count: 2,
      flag: true
    });
    expect(storeB.getState().nested).toEqual({
      count: 2,
      flag: true
    });
  });
  network.disconnect();
  bindingA.destroy();
  bindingB.destroy();
});

test('does not create feedback storm over provider link', async () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const network = connectDocs(docA, docB);
  const storeA = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      name: 'storm-a'
    }
  );
  const storeB = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      name: 'storm-b'
    }
  );
  const bindingA = bindYjs(storeA, {
    doc: docA,
    key: 'counter'
  });
  const bindingB = bindYjs(storeB, {
    doc: docB,
    key: 'counter'
  });
  await wait(60);
  const initCounts = network.counts();
  storeA.getState().increment();
  await waitFor(() => {
    expect(storeB.getState().count).toBe(1);
  });
  await wait(80);
  const finalCounts = network.counts();
  expect(finalCounts.aToB - initCounts.aToB).toBeLessThanOrEqual(8);
  expect(finalCounts.bToA - initCounts.bToA).toBeLessThanOrEqual(8);
  network.disconnect();
  bindingA.destroy();
  bindingB.destroy();
});

test('migrates plain object state into Y.Map during bind', () => {
  const doc = new Y.Doc();
  const map = doc.getMap<any>('counter');
  map.set('state', {
    count: 5,
    nested: {
      flag: true
    },
    list: [1, 2, 3]
  });
  const store = create((set) => ({
    count: 0,
    nested: {
      flag: false
    },
    list: [] as number[]
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  expect(store.getState()).toMatchObject({
    count: 5,
    nested: {
      flag: true
    },
    list: [1, 2, 3]
  });
  expect(map.get('state')).toBeInstanceOf(Y.Map);
  binding.destroy();
});

test('migrates remote plain object replacement and keeps observing nested changes', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0,
    nested: {
      flag: false
    }
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const map = doc.getMap<any>('counter');
  doc.transact(() => {
    map.set('state', {
      count: 9,
      nested: {
        flag: true
      }
    });
  }, 'external');
  await waitFor(() => {
    expect(store.getState()).toMatchObject({
      count: 9,
      nested: {
        flag: true
      }
    });
  });
  const migrated = map.get('state');
  expect(migrated).toBeInstanceOf(Y.Map);
  doc.transact(() => {
    (migrated as Y.Map<any>).set('count', 10);
  }, 'external');
  await waitFor(() => {
    expect(store.getState().count).toBe(10);
  });
  binding.destroy();
});

test('recovers when remote root state is deleted', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 1,
    setCount(count: number) {
      set({
        count
      });
    }
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const map = doc.getMap<any>('counter');

  doc.transact(() => {
    map.delete('state');
  }, 'external');

  await waitFor(() => {
    expect(map.get('state')).toBeInstanceOf(Y.Map);
    expect(store.getState().count).toBeUndefined();
  });
  expect(readState(doc)).toEqual({});

  store.getState().setCount(2);

  await waitFor(() => {
    expect(readState(doc).count).toBe(2);
  });
  binding.destroy();
});

test('shared main broadcasts remote root map replacement to clients', async () => {
  const doc = new Y.Doc();
  const transport = createTransportPair();
  const createCounter = () => ({
    count: 0
  });
  const serverStore = create(createCounter, {
    name: 'yjs-shared-root-replacement',
    transport: transport.main as any
  });
  const patchCalls: string[][] = [];
  serverStore.patch = ({ patches, inversePatches }) => {
    patchCalls.push(
      patches.map((patch) => {
        const path = Array.isArray(patch.path)
          ? patch.path.join('.')
          : patch.path;
        return `${patch.op}:${path}`;
      })
    );
    return {
      patches,
      inversePatches
    };
  };
  const binding = bindYjs(serverStore, {
    doc,
    key: 'counter'
  });
  const clientStore = create(createCounter, {
    name: 'yjs-shared-root-replacement',
    clientTransport: transport.client as any
  });
  await wait();
  await waitFor(() => {
    expect(clientStore.getState().count).toBe(0);
  });

  const replacement = new Y.Map<any>();
  replacement.set('count', 5);
  doc.transact(() => {
    doc.getMap<any>('counter').set('state', replacement);
  }, 'external');

  await waitFor(() => {
    expect(serverStore.getState().count).toBe(5);
    expect(clientStore.getState().count).toBe(5);
  });
  expect(patchCalls).toContainEqual(['replace:count']);
  binding.destroy();
  clientStore.destroy();
  serverStore.destroy();
});

test('shared main filters unsafe remote root replacement patches before patch hook', async () => {
  const doc = new Y.Doc();
  const transport = createTransportPair();
  const serverStore = create(
    () => ({
      count: 0,
      nested: {
        value: 0
      }
    }),
    {
      name: 'yjs-shared-unsafe-root-replacement',
      transport: transport.main as any
    }
  );
  const patchPaths: string[] = [];
  serverStore.patch = ({ patches, inversePatches }) => {
    patchPaths.push(
      ...patches.map((patch) =>
        Array.isArray(patch.path) ? patch.path.join('.') : String(patch.path)
      )
    );
    return {
      patches,
      inversePatches
    };
  };
  const binding = bindYjs(serverStore, {
    doc,
    key: 'counter'
  });
  const replacement = JSON.parse(
    '{"count":2,"nested":{"value":3,"constructor":{"value":4}},"__proto__":{"polluted":true},"prototype":{"value":5}}'
  );

  doc.transact(() => {
    doc.getMap<any>('counter').set('state', replacement);
  }, 'external');

  await waitFor(() => {
    expect(serverStore.getState().count).toBe(2);
  });
  expect(patchPaths).not.toContain('__proto__');
  expect(patchPaths).not.toContain('prototype');
  expect(patchPaths).not.toContain('nested.constructor');
  expect(serverStore.getState().nested).toEqual({
    value: 3
  });
  binding.destroy();
  serverStore.destroy();
});

test('syncs nested array and object diffs from store to yjs', () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    obj: {
      nested: {
        count: 0
      },
      arr: [1, 2, 3],
      removable: 'yes'
    },
    list: [1, { value: 1 }, [1, 2], 'keep'] as Array<
      number | string | { value: number; extra?: boolean } | number[]
    >,
    kind: {
      mode: 1
    } as Record<string, unknown> | string[]
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  store.setState((draft) => {
    draft.obj.nested.count = 2;
    draft.obj.arr = [9];
    delete draft.obj.removable;
    draft.list[0] = [10, 11];
    draft.list[1] = {
      value: 2,
      extra: true
    };
    draft.list[2] = [7, 8, 9];
    draft.list[3] = {
      value: 3
    };
    draft.list.push('tail');
    draft.kind = ['array-mode'];
  });
  store.setState((draft) => {
    draft.list = [1, { value: 2 }, [7], 'done'];
    draft.obj = {
      nested: {
        count: 3
      },
      arr: []
    };
    draft.kind = {
      back: 1
    };
  });
  const next = readState(doc, 'counter') as Record<string, unknown>;
  expect(next.obj).toEqual({
    nested: {
      count: 3
    },
    arr: []
  });
  expect(next.list).toEqual([1, { value: 2 }, [7], 'done']);
  expect(next.kind).toEqual({
    back: 1
  });
  binding.destroy();
});

test('applies remote nested map and array operations to store', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    profile: {
      name: 'alice',
      age: 20
    },
    items: [
      {
        title: 'first',
        done: false
      }
    ],
    count: 0
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const stateMap = doc.getMap<any>('counter').get('state') as Y.Map<any>;
  const items = stateMap.get('items') as Y.Array<any>;
  const first = items.get(0) as Y.Map<any>;
  const remoteProfile = new Y.Map<any>();
  remoteProfile.set('name', 'bob');
  remoteProfile.set('age', 30);
  doc.transact(() => {
    first.set('title', 'updated');
    first.set('done', true);
    stateMap.set('profile', remoteProfile);
    stateMap.delete('count');
  }, 'external');
  await waitFor(() => {
    expect(store.getState()).toMatchObject({
      profile: {
        name: 'bob',
        age: 30
      },
      items: [
        {
          title: 'updated',
          done: true
        }
      ]
    });
    expect((store.getState() as any).count).toBeUndefined();
  });
  doc.transact(() => {
    first.delete('done');
    items.delete(0, 1);
  }, 'external');
  await waitFor(() => {
    expect(store.getState().items).toEqual([]);
  });
  binding.destroy();
});

test('retries remote snapshot flush on setState reentry errors', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0
  }));
  const originalSetState = store.setState.bind(store);
  let shouldFail = true;
  store.setState = ((next, updater) => {
    if (shouldFail) {
      shouldFail = false;
      throw new Error('setState cannot be called within the updater');
    }
    return originalSetState(next as any, updater as any);
  }) as typeof store.setState;
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const map = doc.getMap<any>('counter');
  const remote = new Y.Map<any>();
  remote.set('count', 11);
  doc.transact(() => {
    map.set('state', remote);
  }, 'external');
  await waitFor(() => {
    expect(store.getState().count).toBe(11);
  });
  const stateMap = map.get('state') as Y.Map<any>;
  doc.transact(() => {
    stateMap.set('count', 12);
  }, 'external');
  binding.destroy();
  binding.destroy();
  await wait(20);
  expect(store.getState().count).toBe(11);
});

test('ignores unsafe remote operation keys', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const stateMap = doc.getMap<any>('counter').get('state') as Y.Map<any>;

  doc.transact(() => {
    stateMap.set('__proto__', {
      polluted: true
    });
    stateMap.set('constructor', {
      value: 2
    });
    stateMap.set('count', 1);
  }, 'external');

  await waitFor(() => {
    expect(store.getState().count).toBe(1);
  });
  expect(Object.getPrototypeOf(store.getState())).toBe(Object.prototype);
  expect(
    Object.prototype.hasOwnProperty.call(store.getState(), '__proto__')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(store.getState(), 'constructor')
  ).toBe(false);
  binding.destroy();
});

test('sanitizes unsafe keys inside remote operation values', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    nested: {
      value: 0
    }
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const stateMap = doc.getMap<any>('counter').get('state') as Y.Map<any>;
  const nested = JSON.parse(
    '{"value":2,"__proto__":{"polluted":true},"prototype":{"value":3}}'
  );

  doc.transact(() => {
    stateMap.set('nested', nested);
  }, 'external');

  await waitFor(() => {
    expect(store.getState().nested.value).toBe(2);
  });
  expect(Object.getPrototypeOf(store.getState().nested)).toBe(Object.prototype);
  expect(
    Object.prototype.hasOwnProperty.call(store.getState().nested, '__proto__')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(store.getState().nested, 'prototype')
  ).toBe(false);
  binding.destroy();
});

test('sanitizes unsafe keys inside remote plain root replacements', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0,
    nested: {
      value: 0
    }
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const map = doc.getMap<any>('counter');
  const replacement = JSON.parse(
    '{"count":2,"nested":{"value":3,"__proto__":{"nested":true},"constructor":{"value":4}},"__proto__":{"polluted":true},"prototype":{"value":5}}'
  );

  doc.transact(() => {
    map.set('state', replacement);
  }, 'external');

  await waitFor(() => {
    expect(store.getState().count).toBe(2);
  });
  expect(store.getState().nested).toEqual({
    value: 3
  });
  expect(Object.getPrototypeOf(store.getState())).toBe(Object.prototype);
  expect(Object.getPrototypeOf(store.getState().nested)).toBe(Object.prototype);
  expect(
    Object.prototype.hasOwnProperty.call(store.getState(), '__proto__')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(store.getState(), 'prototype')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(store.getState().nested, 'constructor')
  ).toBe(false);
  binding.destroy();
});

test('retries compacted remote operations on setState reentry errors', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0
  }));
  const originalSetState = store.setState.bind(store);
  let shouldFail = true;
  store.setState = ((next, updater) => {
    if (shouldFail && typeof next === 'function') {
      shouldFail = false;
      throw new Error('setState cannot be called within the updater');
    }
    return originalSetState(next as any, updater as any);
  }) as typeof store.setState;
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const stateMap = doc.getMap<any>('counter').get('state') as Y.Map<any>;
  doc.transact(() => {
    stateMap.set('count', 1);
  }, 'external');
  doc.transact(() => {
    stateMap.set('count', 2);
  }, 'external');
  await waitFor(() => {
    expect(store.getState().count).toBe(2);
  });
  binding.destroy();
});

test('falls back when queueMicrotask is unavailable', async () => {
  const originalQueueMicrotask = globalThis.queueMicrotask;
  (globalThis as any).queueMicrotask = undefined;
  try {
    const doc = new Y.Doc();
    const store = create((set) => ({
      count: 0
    }));
    const binding = bindYjs(store, {
      doc,
      key: 'counter'
    });
    const stateMap = doc.getMap<any>('counter').get('state') as Y.Map<any>;
    doc.transact(() => {
      stateMap.set('count', 7);
    }, 'external');
    await waitFor(() => {
      expect(store.getState().count).toBe(7);
    });
    binding.destroy();
  } finally {
    (globalThis as any).queueMicrotask = originalQueueMicrotask;
  }
});

test('throws when snapshot apply fails with non-reentry error', () => {
  const originalQueueMicrotask = globalThis.queueMicrotask;
  (globalThis as any).queueMicrotask = (callback: () => void) => callback();
  try {
    const doc = new Y.Doc();
    const store = create((set) => ({
      count: 0
    }));
    const originalSetState = store.setState.bind(store);
    store.setState = ((next, updater) => {
      if (typeof next !== 'function') {
        throw new Error('snapshot-fail');
      }
      return originalSetState(next as any, updater as any);
    }) as typeof store.setState;
    const binding = bindYjs(store, {
      doc,
      key: 'counter'
    });
    const map = doc.getMap<any>('counter');
    const remote = new Y.Map<any>();
    remote.set('count', 1);
    expect(() => {
      doc.transact(() => {
        map.set('state', remote);
      }, 'external');
    }).toThrow('snapshot-fail');
    binding.destroy();
  } finally {
    (globalThis as any).queueMicrotask = originalQueueMicrotask;
  }
});

test('throws when operation apply fails with non-reentry error', () => {
  const originalQueueMicrotask = globalThis.queueMicrotask;
  (globalThis as any).queueMicrotask = (callback: () => void) => callback();
  try {
    const doc = new Y.Doc();
    const store = create((set) => ({
      count: 0
    }));
    const originalSetState = store.setState.bind(store);
    store.setState = ((next, updater) => {
      if (typeof next === 'function') {
        throw new Error('operations-fail');
      }
      return originalSetState(next as any, updater as any);
    }) as typeof store.setState;
    const binding = bindYjs(store, {
      doc,
      key: 'counter'
    });
    const stateMap = doc.getMap<any>('counter').get('state') as Y.Map<any>;
    expect(() => {
      doc.transact(() => {
        stateMap.set('count', 1);
      }, 'external');
    }).toThrow('operations-fail');
    binding.destroy();
  } finally {
    (globalThis as any).queueMicrotask = originalQueueMicrotask;
  }
});

test('ignores stale delete paths after parent array replacement', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    items: [
      {
        done: true
      }
    ]
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const stateMap = doc.getMap<any>('counter').get('state') as Y.Map<any>;
  const items = stateMap.get('items') as Y.Array<any>;
  const first = items.get(0) as Y.Map<any>;
  doc.transact(() => {
    first.delete('done');
  }, 'external');
  doc.transact(() => {
    items.delete(0, 1);
  }, 'external');
  await waitFor(() => {
    expect(store.getState().items).toEqual([]);
  });
  binding.destroy();
});

test('ignores unsupported deep events that yield no operations', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0,
    rich: ''
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const originalSetState = store.setState.bind(store);
  let setStateCalls = 0;
  store.setState = ((next, updater) => {
    setStateCalls += 1;
    return originalSetState(next as any, updater as any);
  }) as typeof store.setState;
  const stateMap = doc.getMap<any>('counter').get('state') as Y.Map<any>;
  const text = new Y.Text('a');
  doc.transact(() => {
    stateMap.set('rich', text);
  }, 'external');
  await waitFor(() => {
    expect((store.getState() as any).rich).toBe('a');
    expect(setStateCalls).toBe(1);
  });
  doc.transact(() => {
    text.insert(1, 'b');
  }, 'external');
  await wait(20);
  expect(setStateCalls).toBe(1);
  binding.destroy();
});

test('creates array container for numeric remote paths when parent is missing', async () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    items: [
      {
        title: 'first'
      }
    ]
  }));
  const originalSetState = store.setState.bind(store);
  store.setState = ((next, updater) => {
    if (typeof next === 'function') {
      const detachedDraft: Record<string, unknown> = {};
      next(detachedDraft as any);
      return originalSetState(detachedDraft as any, updater as any);
    }
    return originalSetState(next as any, updater as any);
  }) as typeof store.setState;
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const stateMap = doc.getMap<any>('counter').get('state') as Y.Map<any>;
  const items = stateMap.get('items') as Y.Array<any>;
  const first = items.get(0) as Y.Map<any>;
  doc.transact(() => {
    first.set('title', 'second');
  }, 'external');
  await waitFor(() => {
    expect(store.getState().items).toEqual([
      {
        title: 'second'
      }
    ]);
  });
  binding.destroy();
});

test('handles deep array and object equality checks during local sync', () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    nested: {
      arr: [1, 2],
      obj: {
        a: 1,
        b: 2
      }
    }
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  store.setState((draft) => {
    draft.nested = {
      arr: [1, 2],
      obj: {
        a: 1,
        c: 2
      }
    };
  });
  store.setState((draft) => {
    draft.nested.arr = [1, 3];
  });
  expect(readState(doc, 'counter')).toEqual({
    nested: {
      arr: [1, 3],
      obj: {
        a: 1,
        c: 2
      }
    }
  });
  binding.destroy();
});

test('syncNow skips non-plain pure state and no-ops after destroy', () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  const before = readState(doc, 'counter');
  const originalGetPureState = store.getPureState.bind(store);
  store.getPureState = (() => 42 as any) as typeof store.getPureState;
  binding.syncNow();
  expect(readState(doc, 'counter')).toEqual(before);
  store.getPureState = originalGetPureState;
  binding.destroy();
  binding.syncNow();
});
