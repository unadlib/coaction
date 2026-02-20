import { create } from 'coaction';
import * as Y from 'yjs';
import { bindYjs, yjs } from '../src';

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
  const map = doc.getMap<any>('counter');
  expect(map.get('state')).toEqual({
    count: 0
  });
  store.getState().increment();
  expect(map.get('state')).toEqual({
    count: 1
  });
  binding.destroy();
});

test('syncs state from yjs to coaction', () => {
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
    map.set('state', {
      count: 8
    });
  }, 'external');
  expect(store.getState().count).toBe(8);
  binding.destroy();
});

test('hydrates store from existing yjs state', () => {
  const doc = new Y.Doc();
  const map = doc.getMap<any>('counter');
  map.set('state', {
    count: 12
  });
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
  const map = doc.getMap<any>('counter');
  store.getState().increment();
  expect(map.get('state')).toEqual({
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

test('ignores invalid incoming yjs state', () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  doc.getMap<any>('counter').set('state', 123);
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
  const map = doc.getMap<any>('counter');
  store.getState().increment();
  expect(map.get('state')).toEqual({
    count: 1
  });
  store.destroy();
  store.getState().increment();
  expect(map.get('state')).toEqual({
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
    expect(doc.getMap<any>('counter').get('state')).toEqual({
      nested: {
        count: 1
      }
    });
    binding.destroy();
  } finally {
    (globalThis as any).structuredClone = originalStructuredClone;
  }
});

test('ignores external updates that do not change state key', () => {
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
  expect(store.getState().count).toBe(0);
  binding.destroy();
});
