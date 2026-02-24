import type { Middleware, Store } from 'coaction';

type Snapshot = Record<string, unknown>;

const toSnapshot = (
  state: unknown,
  visited = new WeakMap<object, unknown>()
): Snapshot => {
  if (Array.isArray(state)) {
    if (visited.has(state)) {
      return visited.get(state) as Snapshot;
    }
    const next: unknown[] = [];
    visited.set(state, next);
    for (const item of state) {
      next.push(toSnapshot(item, visited));
    }
    return next as unknown as Snapshot;
  }
  if (typeof state === 'object' && state !== null) {
    if (visited.has(state)) {
      return visited.get(state) as Snapshot;
    }
    const next: Record<string, unknown> = {};
    visited.set(state, next);
    for (const key of Object.keys(state as Record<string, unknown>)) {
      const value = (state as Record<string, unknown>)[key];
      if (typeof value === 'function') {
        continue;
      }
      next[key] = toSnapshot(value, visited);
    }
    return next;
  }
  return state as Snapshot;
};

const isEqual = (
  a: unknown,
  b: unknown,
  visited = new WeakMap<object, WeakSet<object>>()
): boolean => {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (!isEqual(a[index], b[index], visited)) {
        return false;
      }
    }
    return true;
  }
  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false;
  }
  let seenTargets = visited.get(a);
  if (!seenTargets) {
    seenTargets = new WeakSet<object>();
    visited.set(a, seenTargets);
  } else if (seenTargets.has(b)) {
    return true;
  }
  seenTargets.add(b);
  const aObject = a as Record<string, unknown>;
  const bObject = b as Record<string, unknown>;
  const aKeys = Object.keys(aObject);
  const bKeys = Object.keys(bObject);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObject, key)) {
      return false;
    }
    if (!isEqual(aObject[key], bObject[key], visited)) {
      return false;
    }
  }
  return true;
};

export type HistoryOptions<T extends object> = {
  limit?: number;
  partialize?: (state: T) => object;
};

export type HistoryApi<T extends object> = {
  undo: () => boolean;
  redo: () => boolean;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getPast: () => object[];
  getFuture: () => object[];
};

export const history =
  <T extends object>({
    limit = 100,
    partialize = (state: T) => state
  }: HistoryOptions<T> = {}): Middleware<T> =>
  (store: Store<T>) => {
    const past: object[] = [];
    const future: object[] = [];
    let isTimeTraveling = false;
    const getSnapshot = () => toSnapshot(partialize(store.getPureState()));
    const pushPast = (snapshot: object) => {
      past.push(snapshot);
      if (past.length > limit) {
        past.shift();
      }
    };
    const baseSetState = store.setState;
    store.setState = (next, updater) => {
      const previous = getSnapshot();
      const result = baseSetState(next, updater);
      if (isTimeTraveling) {
        return result;
      }
      const current = getSnapshot();
      if (!isEqual(previous, current)) {
        pushPast(previous);
        future.length = 0;
      }
      return result;
    };
    const api: HistoryApi<T> = {
      undo: () => {
        const previous = past.pop();
        if (!previous) {
          return false;
        }
        const current = getSnapshot();
        future.push(current);
        isTimeTraveling = true;
        try {
          baseSetState(previous as any);
        } finally {
          isTimeTraveling = false;
        }
        return true;
      },
      redo: () => {
        const next = future.pop();
        if (!next) {
          return false;
        }
        const current = getSnapshot();
        past.push(current);
        isTimeTraveling = true;
        try {
          baseSetState(next as any);
        } finally {
          isTimeTraveling = false;
        }
        return true;
      },
      clear: () => {
        past.length = 0;
        future.length = 0;
      },
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      getPast: () => [...past],
      getFuture: () => [...future]
    };
    Object.assign(store, {
      history: api
    });
    return store;
  };
