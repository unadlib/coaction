import type { Middleware, Store } from 'coaction';
import * as Y from 'yjs';
import {
  collectRemoteOperations,
  compactOperations,
  deleteAtPath,
  getYValueAtPath,
  isSetStateReentryError,
  RemoteOperation,
  setAtPath
} from './remoteOperations';
import { clone, isPlainObject, scheduleMicrotask } from './shared';
import { syncObjectToYMap } from './sync';
import { createYMap, toPlainObject } from './yjsValue';

export * from 'yjs';

const STATE_KEY = 'state';

export type YjsBindingOptions = {
  doc?: Y.Doc;
  key?: string;
};

export type YjsBinding<T extends object> = {
  doc: Y.Doc;
  map: Y.Map<any>;
  syncNow: () => void;
  destroy: () => void;
  __unsafeTestOnly__?: {
    applyRemoteOperations: (
      operations: Array<{
        type: 'set' | 'delete';
        path: Array<string | number>;
        value?: unknown;
      }>
    ) => void;
  };
};

// Test-only hooks for driving defensive branches that are hard to reach via public flow.
export const __unsafeTestOnly__ = {
  getYValueAtPath: (root: Y.Map<unknown>, path: Array<string | number>) =>
    getYValueAtPath(root, path),
  setAtPath: (target: any, path: Array<string | number>, value: unknown) => {
    setAtPath(target, path, value);
  },
  deleteAtPath: (target: any, path: Array<string | number>) => {
    deleteAtPath(target, path);
  }
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
  const localOrigin = Symbol(`coaction-yjs:${store.name}`);
  let destroyed = false;
  let syncingFromYjs = false;
  let lastSyncedState = (() => {
    const pureState = clone(store.getPureState());
    return isPlainObject(pureState) ? pureState : {};
  })();
  let flushScheduled = false;
  let pendingSnapshot: Record<string, unknown> | null = null;
  let pendingOperations: RemoteOperation[] = [];

  const applyRemoteState = (state: Record<string, unknown>) => {
    const next = clone(state);
    syncingFromYjs = true;
    try {
      store.setState(next as Partial<T>);
      const pureState = clone(store.getPureState());
      lastSyncedState = isPlainObject(pureState) ? pureState : {};
    } finally {
      syncingFromYjs = false;
    }
  };

  const applyRemoteOperations = (operations: RemoteOperation[]) => {
    if (operations.length === 0) {
      return;
    }
    syncingFromYjs = true;
    try {
      store.setState((draft) => {
        const mutableDraft = draft as Record<string, unknown>;
        for (const operation of operations) {
          if (operation.type === 'set') {
            setAtPath(mutableDraft, operation.path, operation.value);
          } else {
            deleteAtPath(mutableDraft, operation.path);
          }
        }
      });
      const pureState = clone(store.getPureState());
      lastSyncedState = isPlainObject(pureState) ? pureState : {};
    } finally {
      syncingFromYjs = false;
    }
  };

  const getStateMap = (): Y.Map<unknown> | null => {
    const state = map.get(STATE_KEY);
    if (state instanceof Y.Map) {
      return state;
    }
    return null;
  };

  const scheduleFlushFromYjs = () => {
    if (destroyed || flushScheduled) {
      return;
    }
    flushScheduled = true;
    scheduleMicrotask(flushFromYjs);
  };

  const flushFromYjs = () => {
    flushScheduled = false;
    if (destroyed) {
      return;
    }
    if (pendingSnapshot) {
      const snapshot = pendingSnapshot;
      pendingSnapshot = null;
      pendingOperations = [];
      try {
        applyRemoteState(snapshot);
      } catch (error) {
        if (isSetStateReentryError(error)) {
          pendingSnapshot = snapshot;
          setTimeout(scheduleFlushFromYjs, 0);
          return;
        }
        throw error;
      }
    }
    if (pendingOperations.length === 0) {
      return;
    }
    const operations = compactOperations(pendingOperations);
    pendingOperations = [];
    try {
      applyRemoteOperations(operations);
    } catch (error) {
      if (isSetStateReentryError(error)) {
        pendingOperations = [...operations, ...pendingOperations];
        setTimeout(scheduleFlushFromYjs, 0);
        return;
      }
      throw error;
    }
  };

  const enqueueSnapshot = (snapshot: Record<string, unknown>) => {
    pendingSnapshot = snapshot;
    pendingOperations = [];
    scheduleFlushFromYjs();
  };

  const enqueueOperations = (operations: RemoteOperation[]) => {
    if (operations.length === 0) {
      return;
    }
    if (!pendingSnapshot) {
      pendingOperations.push(...operations);
    }
    scheduleFlushFromYjs();
  };

  const syncNow = () => {
    if (destroyed || syncingFromYjs) {
      return;
    }
    const pureState = clone(store.getPureState());
    if (!isPlainObject(pureState)) {
      return;
    }
    doc.transact(() => {
      syncObjectToYMap(stateMap, lastSyncedState, pureState);
    }, localOrigin);
    lastSyncedState = pureState;
  };

  const stateObserver = (
    events: Y.YEvent<Y.AbstractType<unknown>>[],
    transaction: Y.Transaction
  ) => {
    if (transaction.origin === localOrigin) {
      return;
    }
    enqueueOperations(collectRemoteOperations(events, stateMap));
  };

  let stateMap!: Y.Map<unknown>;
  const existingStateMap = getStateMap();
  if (existingStateMap) {
    stateMap = existingStateMap;
    applyRemoteState(toPlainObject(stateMap));
  } else {
    const currentState = map.get(STATE_KEY);
    if (isPlainObject(currentState)) {
      stateMap = createYMap(currentState);
      doc.transact(() => {
        map.set(STATE_KEY, stateMap);
      }, localOrigin);
      applyRemoteState(currentState);
    } else {
      const pureState = clone(store.getPureState());
      stateMap = createYMap(isPlainObject(pureState) ? pureState : {});
      doc.transact(() => {
        map.set(STATE_KEY, stateMap);
      }, localOrigin);
    }
  }
  stateMap.observeDeep(stateObserver);

  const observer = (event: Y.YMapEvent<any>) => {
    if (event.transaction.origin === localOrigin) {
      return;
    }
    if (!event.keysChanged.has(STATE_KEY)) {
      return;
    }
    const nextStateMap = getStateMap();
    if (nextStateMap) {
      if (stateMap !== nextStateMap) {
        stateMap.unobserveDeep(stateObserver);
        stateMap = nextStateMap;
        stateMap.observeDeep(stateObserver);
      }
      enqueueSnapshot(toPlainObject(nextStateMap));
      return;
    }
    const currentState = map.get(STATE_KEY);
    if (isPlainObject(currentState)) {
      const migrated = createYMap(currentState);
      doc.transact(() => {
        map.set(STATE_KEY, migrated);
      }, localOrigin);
      if (stateMap !== migrated) {
        stateMap.unobserveDeep(stateObserver);
        stateMap = migrated;
        stateMap.observeDeep(stateObserver);
      }
      enqueueSnapshot(currentState);
    }
  };

  map.observe(observer);
  const unsubscribe = store.subscribe(() => {
    syncNow();
  });

  const binding: YjsBinding<T> = {
    doc,
    map,
    syncNow,
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      unsubscribe();
      map.unobserve(observer);
      stateMap.unobserveDeep(stateObserver);
      if (!options.doc) {
        doc.destroy();
      }
    }
  };
  if (process.env.NODE_ENV === 'test') {
    binding.__unsafeTestOnly__ = {
      applyRemoteOperations: (operations) => {
        applyRemoteOperations(operations as RemoteOperation[]);
      }
    };
  }
  return binding;
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
