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
