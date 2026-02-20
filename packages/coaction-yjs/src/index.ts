import type { Middleware, Store } from 'coaction';
import * as Y from 'yjs';

export * from 'yjs';

const ORIGIN = Symbol('coaction-yjs');

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export type YjsBindingOptions = {
  doc?: Y.Doc;
  key?: string;
};

export type YjsBinding<T extends object> = {
  doc: Y.Doc;
  map: Y.Map<any>;
  syncNow: () => void;
  destroy: () => void;
};

export const bindYjs = <T extends object>(
  store: Store<T>,
  options: YjsBindingOptions = {}
): YjsBinding<T> => {
  if (store.share === 'client') {
    throw new Error('Yjs binding is not supported in client store mode.');
  }
  const doc = options.doc ?? new Y.Doc();
  const key = options.key ?? `coaction:${store.name}`;
  const map = doc.getMap<any>(key);

  const syncNow = () => {
    const pureState = clone(store.getPureState());
    doc.transact(() => {
      map.set('state', pureState);
    }, ORIGIN);
  };

  const syncFromYjs = () => {
    const incoming = map.get('state');
    if (typeof incoming !== 'object' || incoming === null) {
      return;
    }
    store.setState(clone(incoming));
  };

  if (map.has('state')) {
    syncFromYjs();
  } else {
    syncNow();
  }

  const observer = (event: Y.YMapEvent<any>) => {
    if (event.transaction.origin === ORIGIN) {
      return;
    }
    if (event.keysChanged.has('state')) {
      syncFromYjs();
    }
  };

  map.observe(observer);
  const unsubscribe = store.subscribe(() => {
    syncNow();
  });

  return {
    doc,
    map,
    syncNow,
    destroy: () => {
      unsubscribe();
      map.unobserve(observer);
      if (!options.doc) {
        doc.destroy();
      }
    }
  };
};

export const yjs =
  <T extends object>(options: YjsBindingOptions = {}): Middleware<T> =>
  (store) => {
    const binding = bindYjs(store, options);
    const baseDestroy = store.destroy;
    store.destroy = () => {
      binding.destroy();
      baseDestroy();
    };
    return store;
  };
