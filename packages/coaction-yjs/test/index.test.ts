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
