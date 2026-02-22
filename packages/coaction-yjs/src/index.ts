import type { Middleware, Store } from 'coaction';
import * as Y from 'yjs';

export * from 'yjs';

const STATE_KEY = 'state';

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function toPlainObject(value: Y.Map<unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  value.forEach((item, key) => {
    next[key] = toPlainValue(item);
  });
  return next;
}

function toPlainArray(value: Y.Array<unknown>): unknown[] {
  return value.toArray().map((item) => toPlainValue(item));
}

function toPlainValue(value: unknown): unknown {
  if (value instanceof Y.Map) {
    return toPlainObject(value);
  }
  if (value instanceof Y.Array) {
    return toPlainArray(value);
  }
  return value;
}

function createYMap(value: Record<string, unknown>): Y.Map<unknown> {
  const next = new Y.Map<unknown>();
  for (const [key, item] of Object.entries(value)) {
    next.set(key, toYValue(item));
  }
  return next;
}

function createYArray(value: unknown[]): Y.Array<unknown> {
  const next = new Y.Array<unknown>();
  if (value.length > 0) {
    next.insert(
      0,
      value.map((item) => toYValue(item))
    );
  }
  return next;
}

function toYValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return createYArray(value);
  }
  if (isPlainObject(value)) {
    return createYMap(value);
  }
  if (typeof value === 'object' && value !== null) {
    return clone(value);
  }
  return value;
}

function isEqualValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!isEqualValue(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) {
        return false;
      }
      if (!isEqualValue(left[key], right[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function syncObjectToYMap(
  target: Y.Map<unknown>,
  previous: Record<string, unknown>,
  source: Record<string, unknown>
) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(source)]);
  for (const key of keys) {
    const hasPrevious = Object.prototype.hasOwnProperty.call(previous, key);
    const hasNext = Object.prototype.hasOwnProperty.call(source, key);
    if (!hasNext) {
      target.delete(key);
      continue;
    }
    const previousValue = hasPrevious ? previous[key] : undefined;
    const nextValue = source[key];
    if (hasPrevious && isEqualValue(previousValue, nextValue)) {
      continue;
    }
    const current = target.get(key);
    if (Array.isArray(nextValue)) {
      if (Array.isArray(previousValue) && current instanceof Y.Array) {
        syncArrayToYArray(current, previousValue, nextValue);
      } else {
        target.set(key, createYArray(nextValue));
      }
      continue;
    }
    if (isPlainObject(nextValue)) {
      if (isPlainObject(previousValue) && current instanceof Y.Map) {
        syncObjectToYMap(current, previousValue, nextValue);
      } else {
        target.set(key, createYMap(nextValue));
      }
      continue;
    }
    const normalized =
      typeof nextValue === 'object' && nextValue !== null
        ? clone(nextValue)
        : nextValue;
    if (!Object.is(current, normalized)) {
      target.set(key, normalized);
    }
  }
}

function syncArrayToYArray(
  target: Y.Array<unknown>,
  previous: unknown[],
  source: unknown[]
) {
  if (target.length > source.length) {
    target.delete(source.length, target.length - source.length);
  }
  const maxLength = Math.max(previous.length, source.length);
  for (let index = 0; index < maxLength; index += 1) {
    const hasPrevious = index < previous.length;
    const hasNext = index < source.length;
    if (!hasNext) {
      continue;
    }
    const previousValue = hasPrevious ? previous[index] : undefined;
    const nextValue = source[index];
    if (hasPrevious && isEqualValue(previousValue, nextValue)) {
      continue;
    }
    if (index >= target.length) {
      target.insert(index, [toYValue(nextValue)]);
      continue;
    }
    const current = target.get(index);
    if (Array.isArray(nextValue)) {
      if (Array.isArray(previousValue) && current instanceof Y.Array) {
        syncArrayToYArray(current, previousValue, nextValue);
      } else {
        target.delete(index, 1);
        target.insert(index, [createYArray(nextValue)]);
      }
      continue;
    }
    if (isPlainObject(nextValue)) {
      if (isPlainObject(previousValue) && current instanceof Y.Map) {
        syncObjectToYMap(current, previousValue, nextValue);
      } else {
        target.delete(index, 1);
        target.insert(index, [createYMap(nextValue)]);
      }
      continue;
    }
    const normalized =
      typeof nextValue === 'object' && nextValue !== null
        ? clone(nextValue)
        : nextValue;
    if (!Object.is(current, normalized)) {
      target.delete(index, 1);
      target.insert(index, [normalized]);
    }
  }
}

function isSetStateReentryError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'setState cannot be called within the updater'
  );
}

type PathSegment = string | number;

type RemoteOperation =
  | {
      type: 'set';
      path: PathSegment[];
      value: unknown;
    }
  | {
      type: 'delete';
      path: PathSegment[];
    };

function cloneForStore<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    return clone(value);
  }
  return value;
}

function toPathKey(path: PathSegment[]): string {
  return path
    .map((segment) => `${typeof segment}:${String(segment)}`)
    .join('|');
}

function compactOperations(operations: RemoteOperation[]): RemoteOperation[] {
  const deduplicated = new Map<string, RemoteOperation>();
  for (const operation of operations) {
    const key = toPathKey(operation.path);
    if (deduplicated.has(key)) {
      deduplicated.delete(key);
    }
    deduplicated.set(key, operation);
  }
  return Array.from(deduplicated.values()).sort(
    (left, right) => left.path.length - right.path.length
  );
}

function getYValueAtPath(root: Y.Map<unknown>, path: PathSegment[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current instanceof Y.Map) {
      current = current.get(String(segment));
      continue;
    }
    if (current instanceof Y.Array) {
      const index =
        typeof segment === 'number' ? segment : Number.parseInt(segment, 10);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      current = current.get(index);
      continue;
    }
    return undefined;
  }
  return current;
}

function setAtPath(target: any, path: PathSegment[], value: unknown) {
  if (path.length === 0) {
    return;
  }
  let current = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const nextSegment = path[index + 1];
    const nextValue = current[segment];
    if (typeof nextValue !== 'object' || nextValue === null) {
      current[segment] = typeof nextSegment === 'number' ? [] : {};
    }
    current = current[segment];
  }
  const leaf = path[path.length - 1];
  current[leaf] = cloneForStore(value);
}

function deleteAtPath(target: any, path: PathSegment[]) {
  if (path.length === 0) {
    return;
  }
  let current = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    current = current[path[index]];
    if (typeof current !== 'object' || current === null) {
      return;
    }
  }
  const leaf = path[path.length - 1];
  if (Array.isArray(current) && typeof leaf === 'number') {
    if (leaf >= 0 && leaf < current.length) {
      current.splice(leaf, 1);
    }
    return;
  }
  delete current[leaf];
}

function collectRemoteOperations(
  events: Y.YEvent<Y.AbstractType<unknown>>[],
  stateMap: Y.Map<unknown>
): RemoteOperation[] {
  const operations: RemoteOperation[] = [];
  for (const event of events) {
    if (event instanceof Y.YMapEvent) {
      for (const changedKey of event.keysChanged) {
        const path = [...event.path, changedKey];
        const keyChange = event.changes.keys.get(changedKey);
        if (keyChange?.action === 'delete') {
          operations.push({
            type: 'delete',
            path
          });
          continue;
        }
        operations.push({
          type: 'set',
          path,
          value: toPlainValue(getYValueAtPath(stateMap, path))
        });
      }
      continue;
    }
    if (event instanceof Y.YArrayEvent) {
      const path = [...event.path];
      operations.push({
        type: 'set',
        path,
        value: toPlainValue(getYValueAtPath(stateMap, path))
      });
    }
  }
  return operations;
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
    queueMicrotask(flushFromYjs);
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
