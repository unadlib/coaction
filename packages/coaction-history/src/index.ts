import type { Middleware, Store } from 'coaction';

type Snapshot = Record<string, unknown>;

const toSnapshot = (state: unknown): Snapshot => {
  if (Array.isArray(state)) {
    return state.map((item) => toSnapshot(item)) as unknown as Snapshot;
  }
  if (typeof state === 'object' && state !== null) {
    const next: Record<string, unknown> = {};
    for (const key in state as Record<string, unknown>) {
      const value = (state as Record<string, unknown>)[key];
      if (typeof value === 'function') {
        continue;
      }
      next[key] = toSnapshot(value);
    }
    return next;
  }
  return state as Snapshot;
};

const isEqual = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

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
