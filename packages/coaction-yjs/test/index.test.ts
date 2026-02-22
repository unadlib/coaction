import { create } from 'coaction';
import * as Y from 'yjs';
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

test('works as middleware', () => {
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
  doc.getMap<any>('counter').set('state', 123);
  await wait(20);
  expect(store.getState().count).toBe(0);
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
  store.getState().increment();
  expect(readState(doc, 'counter')).toEqual({
    count: 1
  });
});

test('falls back to JSON cloning without structuredClone', () => {
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
    } as Record<string, unknown> | string[],
    stamp: new Date('2024-01-01T00:00:00.000Z')
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
    draft.stamp = new Date('2024-02-01T00:00:00.000Z');
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
  expect(next.stamp).toBeInstanceOf(Date);
  expect((next.stamp as Date).toISOString()).toBe('2024-02-01T00:00:00.000Z');
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
    if (shouldFail && typeof next !== 'function') {
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
  const originalStructuredClone = globalThis.structuredClone;
  (globalThis as any).structuredClone = undefined;
  try {
    const doc = new Y.Doc();
    const store = create((set) => ({
      count: 0
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
  } finally {
    (globalThis as any).structuredClone = originalStructuredClone;
  }
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
