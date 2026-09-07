import {
  applyRootReplacementWithPatches,
  isSameStructure as isEqual,
  onStoreCommit,
  onStoreCommitPrepare,
  onStoreReady,
  replayStorePatches,
  type Middleware,
  type StoreCommit,
  type Store
} from 'coaction/adapter';
import {
  apply as applyWithMutative,
  create as createWithMutative,
  type Draft,
  type Patches
} from 'mutative';
import {
  createTravelJournal,
  type TravelJournal,
  type TravelsControlledTransition
} from 'travels';

type Snapshot = Record<PropertyKey, unknown>;
// Coaction patch middleware may emit either supported Mutative path format.
// The controlled journal retains and returns those external patches unchanged.
type CoactionPatchOptions = any;
type CoactionTravelJournal = TravelJournal<object, false, CoactionPatchOptions>;

const historySuppressionSymbol = Symbol.for('coaction.history.suppress');

const isUnsafeKey = (key: PropertyKey) =>
  typeof key === 'string' &&
  (key === '__proto__' || key === 'prototype' || key === 'constructor');

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter(
    (key) =>
      Object.prototype.propertyIsEnumerable.call(value, key) &&
      !isUnsafeKey(key)
  );

const setOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  key: PropertyKey,
  value: unknown
) => {
  if (isUnsafeKey(key)) {
    return;
  }
  target[key] = value;
};

const isObjectRecord = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype.constructor === Object;
};

const toSnapshot = (
  state: unknown,
  visited = new WeakMap<object, unknown>()
): Snapshot => {
  if (Array.isArray(state)) {
    if (visited.has(state)) {
      return visited.get(state) as Snapshot;
    }
    const next: unknown[] = [];
    next.length = state.length;
    visited.set(state, next);
    const stateRecord = state as unknown as Record<PropertyKey, unknown>;
    const nextRecord = next as unknown as Record<PropertyKey, unknown>;
    for (const key of getOwnEnumerableKeys(state)) {
      const value = stateRecord[key];
      if (typeof value === 'function') {
        continue;
      }
      setOwnEnumerable(nextRecord, key, toSnapshot(value, visited));
    }
    return next as unknown as Snapshot;
  }
  if (typeof state === 'object' && state !== null) {
    if (!isObjectRecord(state)) {
      return state as Snapshot;
    }
    if (visited.has(state)) {
      return visited.get(state) as Snapshot;
    }
    const next: Record<PropertyKey, unknown> =
      Object.getPrototypeOf(state) === null ? Object.create(null) : {};
    visited.set(state, next);
    for (const key of getOwnEnumerableKeys(state)) {
      const value = (state as Record<PropertyKey, unknown>)[key];
      if (typeof value === 'function') {
        continue;
      }
      setOwnEnumerable(next, key, toSnapshot(value, visited));
    }
    return next;
  }
  return state as Snapshot;
};

const hasCircularReference = (
  value: unknown,
  ancestors = new WeakSet<object>(),
  seen = new WeakSet<object>()
): boolean => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!Array.isArray(value) && !isObjectRecord(value)) {
    return false;
  }
  if (ancestors.has(value)) {
    return true;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  ancestors.add(value);
  for (const key of getOwnEnumerableKeys(value)) {
    const child = (value as Record<PropertyKey, unknown>)[key];
    if (
      typeof child !== 'function' &&
      hasCircularReference(child, ancestors, seen)
    ) {
      return true;
    }
  }
  ancestors.delete(value);
  return false;
};

const applySnapshot = (
  target: Record<PropertyKey, unknown>,
  nextState: object,
  currentState: object
) => {
  const next = nextState as Record<PropertyKey, unknown>;
  const current = currentState as Record<PropertyKey, unknown>;
  const snapshotVisited = new WeakMap<object, unknown>();
  snapshotVisited.set(nextState, target);
  if (Array.isArray(target) && Array.isArray(nextState)) {
    target.length = nextState.length;
  }
  for (const key of getOwnEnumerableKeys(current)) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      delete target[key];
    }
  }
  for (const key of getOwnEnumerableKeys(next)) {
    setOwnEnumerable(target, key, toSnapshot(next[key], snapshotVisited));
  }
};

const isPatchableObject = (
  value: unknown
): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  isObjectRecord(value);

const applyPartialSnapshot = (
  target: Record<PropertyKey, unknown>,
  nextState: object,
  currentState: object,
  visited = new WeakMap<object, WeakSet<object>>(),
  snapshotVisited = new WeakMap<object, unknown>()
) => {
  if (!snapshotVisited.has(nextState)) {
    snapshotVisited.set(nextState, target);
  }
  let seenCurrentStates = visited.get(nextState);
  if (!seenCurrentStates) {
    seenCurrentStates = new WeakSet<object>();
    visited.set(nextState, seenCurrentStates);
  } else if (seenCurrentStates.has(currentState)) {
    return;
  }
  seenCurrentStates.add(currentState);
  const next = nextState as Record<PropertyKey, unknown>;
  const current = currentState as Record<PropertyKey, unknown>;
  if (Array.isArray(target) && Array.isArray(nextState)) {
    target.length = nextState.length;
  }
  for (const key of getOwnEnumerableKeys(current)) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      delete target[key];
    }
  }
  for (const key of getOwnEnumerableKeys(next)) {
    const nextValue = next[key];
    const currentValue = current[key];
    const targetValue = target[key];
    if (
      isPatchableObject(nextValue) &&
      isPatchableObject(currentValue) &&
      isPatchableObject(targetValue)
    ) {
      applyPartialSnapshot(
        targetValue as Record<PropertyKey, unknown>,
        nextValue,
        currentValue,
        visited,
        snapshotVisited
      );
      continue;
    }
    setOwnEnumerable(target, key, toSnapshot(nextValue, snapshotVisited));
  }
};

const cloneSnapshotList = (snapshots: object[]) =>
  snapshots.map((snapshot) => toSnapshot(snapshot));

export type HistoryOptions<T extends object> = {
  limit?: number;
  partialize?: (state: T) => object;
};

export type HistoryPatches = {
  patches: Patches[];
  inversePatches: Patches[];
  position: number;
};

export type HistoryApi<_T extends object> = {
  undo: () => boolean;
  redo: () => boolean;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getPast: () => object[];
  getFuture: () => object[];
  getPatches: () => HistoryPatches | undefined;
};

const snapshotHistory =
  <T extends object>(options: HistoryOptions<T> = {}): Middleware<T> =>
  (store: Store<T>) => {
    if (store.share === 'client') {
      throw new Error(
        'history() is not supported in client store mode. Apply history() to the main shared store instead.'
      );
    }
    const { limit = 100, partialize = (state: T) => state } = options;
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error('history limit must be a non-negative integer.');
    }
    const applyHistorySnapshot = options.partialize
      ? applyPartialSnapshot
      : applySnapshot;
    const applyStore = (store as { apply?: Store<T>['apply'] }).apply?.bind(
      store
    );
    const past: object[] = [];
    const future: object[] = [];
    let isTimeTraveling = false;
    let isSetStateRecording = false;
    let suppressionDepth = 0;
    let lastSnapshot: object | undefined;
    let unsubscribeStore: (() => void) | undefined;
    const getSnapshot = () => toSnapshot(partialize(store.getPureState()));
    const runWithoutRecording = <R>(callback: () => R): R => {
      suppressionDepth += 1;
      try {
        return callback();
      } finally {
        suppressionDepth -= 1;
        lastSnapshot = getSnapshot();
      }
    };
    const pushPast = (snapshot: object) => {
      past.push(snapshot);
      if (past.length > limit) {
        past.shift();
      }
    };
    const recordChange = (previous: object, current: object) => {
      if (!isEqual(previous, current)) {
        pushPast(previous);
        future.length = 0;
      }
      lastSnapshot = current;
    };
    const applyTimeTravelSnapshot = (snapshot: object, current: object) => {
      const nextState = toSnapshot(store.getPureState());
      applyHistorySnapshot(
        nextState as Record<PropertyKey, unknown>,
        snapshot,
        current
      );
      if (applyStore && hasCircularReference(snapshot)) {
        baseSetState(nextState as T, () => {
          applyStore(nextState as T);
          return [];
        });
        return;
      }
      baseSetState(nextState as T, () => {
        return applyRootReplacementWithPatches(
          store,
          nextState as Record<PropertyKey, unknown>,
          {
            applyExactReplacement:
              !store.share && applyStore
                ? (replacementState) => applyStore(replacementState)
                : undefined
          }
        );
      });
    };
    const cancelReadySubscription = onStoreReady(store, () => {
      lastSnapshot = getSnapshot();
      unsubscribeStore = store.subscribe(() => {
        const current = getSnapshot();
        if (isSetStateRecording || isTimeTraveling || suppressionDepth > 0) {
          lastSnapshot = current;
          return;
        }
        recordChange(lastSnapshot ?? current, current);
      });
    });
    const baseSetState = store.setState;
    store.setState = (next, updater) => {
      const previous = getSnapshot();
      isSetStateRecording = true;
      let result: ReturnType<typeof baseSetState>;
      try {
        result = baseSetState(next, updater);
      } finally {
        isSetStateRecording = false;
      }
      if (isTimeTraveling || suppressionDepth > 0) {
        lastSnapshot = getSnapshot();
        return result;
      }
      const current = getSnapshot();
      recordChange(previous, current);
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
          applyTimeTravelSnapshot(previous, current);
        } catch (error) {
          future.pop();
          past.push(previous);
          throw error;
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
          applyTimeTravelSnapshot(next, current);
        } catch (error) {
          past.pop();
          future.push(next);
          throw error;
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
      getPast: () => cloneSnapshotList(past),
      getFuture: () => cloneSnapshotList(future),
      getPatches: () => undefined
    };
    Object.assign(store, {
      history: api
    });
    Object.defineProperty(store, historySuppressionSymbol, {
      configurable: true,
      value: runWithoutRecording
    });
    if (typeof store.destroy === 'function') {
      const baseDestroy = store.destroy;
      let destroyed = false;
      store.destroy = () => {
        if (destroyed) {
          return;
        }
        destroyed = true;
        cancelReadySubscription();
        unsubscribeStore?.();
        unsubscribeStore = undefined;
        const metadataStore = store as unknown as Record<symbol, unknown>;
        if (metadataStore[historySuppressionSymbol] === runWithoutRecording) {
          delete metadataStore[historySuppressionSymbol];
        }
        baseDestroy();
      };
    }
    return store;
  };

const isDenseArrayIndex = (key: PropertyKey, length: number) => {
  if (typeof key !== 'string') {
    return false;
  }
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  );
};

const isTravelCompatibleState = (
  value: unknown,
  seen = new WeakSet<object>()
): boolean => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object') {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  const keys = Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );
  if (Array.isArray(value)) {
    if (
      keys.length !== value.length ||
      keys.some((key) => !isDenseArrayIndex(key, value.length))
    ) {
      return false;
    }
    for (let index = 0; index < value.length; index += 1) {
      if (
        !Object.prototype.hasOwnProperty.call(value, index) ||
        !isTravelCompatibleState(value[index], seen)
      ) {
        return false;
      }
    }
    return true;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  for (const key of keys) {
    if (
      typeof key !== 'string' ||
      isUnsafeKey(key) ||
      !isTravelCompatibleState(
        (value as Record<PropertyKey, unknown>)[key],
        seen
      )
    ) {
      return false;
    }
  }
  return true;
};

const isTravelCompatiblePatches = (patches: Patches) => {
  const seen = new WeakSet<object>();
  for (const patch of patches) {
    const path = Array.isArray(patch.path)
      ? patch.path
      : typeof patch.path === 'string'
        ? patch.path.split('/').filter(Boolean)
        : [];
    if (
      path.some(
        (segment) =>
          (typeof segment !== 'string' && typeof segment !== 'number') ||
          (typeof segment === 'string' && isUnsafeKey(segment))
      )
    ) {
      return false;
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, 'value') &&
      !isTravelCompatibleState((patch as { value: unknown }).value, seen)
    ) {
      return false;
    }
  }
  return true;
};

const hasObjectPatchValue = (patches: Patches) =>
  patches.some(
    (patch) =>
      Object.prototype.hasOwnProperty.call(patch, 'value') &&
      typeof patch.value === 'object' &&
      patch.value !== null
  );

const needsSnapshotCompatibility = (
  state: object,
  patches: Patches,
  inversePatches: Patches
) =>
  !isTravelCompatiblePatches(patches) ||
  !isTravelCompatiblePatches(inversePatches) ||
  (hasObjectPatchValue(patches) && !isTravelCompatibleState(state));

const createPatchHistory = <T extends object>(
  store: Store<T>,
  limit: number,
  baseSetState: Store<T>['setState'],
  partialize?: (state: T) => object
): {
  api: HistoryApi<T>;
  destroy: () => void;
  runWithoutRecording: <R>(callback: () => R) => R;
} => {
  let isTimeTraveling = false;
  let isSetStateRecording = false;
  let suppressionDepth = 0;
  let unsubscribeStore: (() => void) | undefined;
  let unsubscribeCommit: (() => void) | undefined;
  let unsubscribePrepare: (() => void) | undefined;
  let baseApply: Store<T>['apply'] | undefined;
  let snapshotPast: object[] | undefined;
  let snapshotFuture: object[] = [];
  let snapshotCurrent: object | undefined;
  const toHistoryState = (state: T): object =>
    partialize ? toSnapshot(partialize(state)) : state;
  const toHistorySnapshot = (state: T): object =>
    toSnapshot(partialize ? partialize(state) : state);
  const applyPartialTransition = ({
    state,
    patches
  }: TravelsControlledTransition<object, CoactionPatchOptions>) => {
    const nextState = applyWithMutative(state, patches) as object;
    baseSetState((draft) => {
      applyPartialSnapshot(
        draft as Record<PropertyKey, unknown>,
        nextState,
        state
      );
    });
    return toHistoryState(store.getPureState());
  };
  const createJournal = (initialState: object): CoactionTravelJournal =>
    createTravelJournal<object, false, CoactionPatchOptions>(initialState, {
      apply: partialize
        ? applyPartialTransition
        : ({ patches, inversePatches }) =>
            replayStorePatches(
              store,
              { patches, inversePatches },
              { setState: baseSetState }
            ),
      maxHistory: limit,
      warnOnUnsupportedState: false
    });
  let journal = createJournal(toHistoryState(store.getPureState()));

  const recordDerivedState = (
    current: object,
    applyHistorySnapshot: typeof applySnapshot
  ) => {
    const previous = journal.getState();
    if (isEqual(previous, current)) {
      return;
    }
    const update = (draft: Draft<object>) => {
      applyHistorySnapshot(
        draft as Record<PropertyKey, unknown>,
        current,
        previous
      );
    };
    const [, patches, inversePatches] = createWithMutative(previous, update, {
      enablePatches: true
    }) as [object, Patches, Patches];
    journal.recordPatches(current, { patches, inversePatches });
  };

  const resetJournal = (state: T) => {
    journal = createJournal(toHistoryState(state));
  };
  const pushSnapshotPast = (snapshot: object) => {
    if (!snapshotPast) {
      return;
    }
    snapshotPast.push(snapshot);
    if (snapshotPast.length > limit) {
      snapshotPast.shift();
    }
  };
  const recordSnapshotState = (state: T) => {
    const current = toHistorySnapshot(state);
    if (snapshotCurrent && !isEqual(snapshotCurrent, current)) {
      pushSnapshotPast(snapshotCurrent);
      snapshotFuture.length = 0;
    }
    snapshotCurrent = current;
  };
  const subscribeSnapshotCompatibility = () => {
    if (unsubscribeStore) {
      return;
    }
    unsubscribeStore = store.subscribe(() => {
      if (isSetStateRecording || isTimeTraveling || suppressionDepth > 0) {
        return;
      }
      recordSnapshotState(store.getPureState());
    });
  };
  const beginSnapshotCompatibility = () => {
    if (snapshotPast) {
      return;
    }
    const previous = journal.getState();
    snapshotPast = materialize('past', previous);
    snapshotFuture = [];
    snapshotCurrent = toSnapshot(previous);
    unsubscribeCommit?.();
    unsubscribeCommit = undefined;
    unsubscribePrepare?.();
    unsubscribePrepare = undefined;
    subscribeSnapshotCompatibility();
  };
  const switchToSnapshotCompatibility = (state: T) => {
    beginSnapshotCompatibility();
    recordSnapshotState(state);
  };
  const recordProjectedState = (state: T) => {
    const current = toHistorySnapshot(state);
    if (!isTravelCompatibleState(current)) {
      switchToSnapshotCompatibility(state);
      return;
    }
    recordDerivedState(current, applyPartialSnapshot);
  };
  const recordCommit = ({ state, patches, inversePatches }: StoreCommit<T>) => {
    if (isTimeTraveling || suppressionDepth > 0) {
      return;
    }
    if (snapshotPast) {
      recordSnapshotState(state);
      return;
    }
    if (needsSnapshotCompatibility(state, patches, inversePatches)) {
      switchToSnapshotCompatibility(state);
      return;
    }
    journal.recordPatches(state, { patches, inversePatches });
  };
  if (!partialize) {
    unsubscribeCommit = onStoreCommit(store, recordCommit);
    unsubscribePrepare = onStoreCommitPrepare(
      store,
      ({ state, patches, inversePatches }) => {
        if (
          isTimeTraveling ||
          suppressionDepth > 0 ||
          snapshotPast ||
          !needsSnapshotCompatibility(state, patches, inversePatches)
        ) {
          return false;
        }
        beginSnapshotCompatibility();
        return true;
      }
    );
  }

  const recordExternalState = () => {
    if (isTimeTraveling || suppressionDepth > 0) {
      return;
    }
    const state = store.getPureState();
    if (snapshotPast) {
      recordSnapshotState(state);
      return;
    }
    if (partialize) {
      recordProjectedState(state);
      return;
    }
    if (!isTravelCompatibleState(state)) {
      switchToSnapshotCompatibility(state);
      return;
    }
    const current = toSnapshot(state);
    recordDerivedState(current, applySnapshot);
  };

  const applyCompatibilitySnapshot = (snapshot: object, current: object) => {
    const nextState = toSnapshot(store.getPureState());
    const applyHistorySnapshot = partialize
      ? applyPartialSnapshot
      : applySnapshot;
    applyHistorySnapshot(
      nextState as Record<PropertyKey, unknown>,
      snapshot,
      current
    );
    if (baseApply && hasCircularReference(snapshot)) {
      baseSetState(nextState as T, () => {
        baseApply!(nextState as T);
        return [];
      });
      return;
    }
    baseSetState(nextState as T, () =>
      applyRootReplacementWithPatches(
        store,
        nextState as Record<PropertyKey, unknown>,
        {
          applyExactReplacement:
            !store.share && baseApply
              ? (replacementState) => baseApply!(replacementState)
              : undefined
        }
      )
    );
  };

  const move = (direction: 'back' | 'forward') => {
    if (snapshotPast) {
      const target =
        direction === 'back' ? snapshotPast.pop() : snapshotFuture.pop();
      if (!target) {
        return false;
      }
      const current =
        snapshotCurrent ?? toHistorySnapshot(store.getPureState());
      if (direction === 'back') {
        snapshotFuture.push(current);
      } else {
        pushSnapshotPast(current);
      }
      isTimeTraveling = true;
      try {
        applyCompatibilitySnapshot(target, current);
        snapshotCurrent = toHistorySnapshot(store.getPureState());
      } catch (error) {
        if (direction === 'back') {
          snapshotFuture.pop();
          snapshotPast.push(target);
        } else {
          snapshotPast.pop();
          snapshotFuture.push(target);
        }
        throw error;
      } finally {
        isTimeTraveling = false;
      }
      return true;
    }
    const canMove =
      direction === 'back' ? journal.canBack() : journal.canForward();
    if (!canMove) {
      return false;
    }
    isTimeTraveling = true;
    try {
      journal[direction]();
      return true;
    } finally {
      isTimeTraveling = false;
    }
  };

  const materialize = (
    side: 'past' | 'future',
    initialState: object = journal.getState()
  ) => {
    const entries = journal.getHistoryEntries();
    const position = journal.getPosition();
    let state = initialState;
    const snapshots: object[] = [];
    if (side === 'past') {
      for (let index = position - 1; index >= 0; index -= 1) {
        state = applyWithMutative(state, entries[index].inversePatches);
        snapshots.push(toSnapshot(state));
      }
      snapshots.reverse();
      return snapshots;
    }
    for (let index = position; index < entries.length; index += 1) {
      state = applyWithMutative(state, entries[index].patches);
      snapshots.push(toSnapshot(state));
    }
    snapshots.reverse();
    return snapshots;
  };

  const api: HistoryApi<T> = {
    undo: () => move('back'),
    redo: () => move('forward'),
    clear: () => {
      if (snapshotPast) {
        snapshotPast.length = 0;
        snapshotFuture.length = 0;
        snapshotCurrent = toHistorySnapshot(store.getPureState());
        return;
      }
      journal.rebase();
    },
    canUndo: () => (snapshotPast ? snapshotPast.length > 0 : journal.canBack()),
    canRedo: () =>
      snapshotPast ? snapshotFuture.length > 0 : journal.canForward(),
    getPast: () =>
      snapshotPast ? cloneSnapshotList(snapshotPast) : materialize('past'),
    getFuture: () =>
      snapshotPast ? cloneSnapshotList(snapshotFuture) : materialize('future'),
    getPatches: () => {
      if (snapshotPast) {
        return undefined;
      }
      const entries = journal.getHistoryEntries();
      return {
        patches: entries.map((entry) => entry.patches),
        inversePatches: entries.map((entry) => entry.inversePatches),
        position: journal.getPosition()
      };
    }
  };

  store.setState = (next, updater) => {
    if (
      !partialize &&
      typeof next === 'object' &&
      next !== null &&
      !isTravelCompatibleState(next)
    ) {
      beginSnapshotCompatibility();
    }
    isSetStateRecording = true;
    let result: ReturnType<typeof baseSetState>;
    try {
      result = baseSetState(next, updater);
    } finally {
      isSetStateRecording = false;
    }
    if (suppressionDepth === 0 && !isTimeTraveling) {
      if (snapshotPast) {
        recordSnapshotState(store.getPureState());
      } else if (partialize) {
        recordProjectedState(store.getPureState());
      }
    }
    return result;
  };

  const cancelReadySubscription = onStoreReady(store, () => {
    baseApply = store.apply;
    if (partialize && !unsubscribeStore) {
      unsubscribeStore = store.subscribe(() => {
        if (isSetStateRecording || isTimeTraveling || suppressionDepth > 0) {
          return;
        }
        recordExternalState();
      });
    }
  });

  const runWithoutRecording = <R>(callback: () => R): R => {
    suppressionDepth += 1;
    try {
      return callback();
    } finally {
      suppressionDepth -= 1;
      if (suppressionDepth === 0) {
        if (snapshotPast) {
          snapshotPast.length = 0;
          snapshotFuture.length = 0;
          snapshotCurrent = toHistorySnapshot(store.getPureState());
        } else {
          resetJournal(store.getPureState());
        }
      }
    }
  };

  return {
    api,
    runWithoutRecording,
    destroy: () => {
      cancelReadySubscription();
      unsubscribeCommit?.();
      unsubscribeCommit = undefined;
      unsubscribePrepare?.();
      unsubscribePrepare = undefined;
      unsubscribeStore?.();
      unsubscribeStore = undefined;
    }
  };
};

/**
 * Add undo/redo history to a Coaction store.
 *
 * JSON-compatible whole-store and partialized history are patch-based and
 * delegated to Travels. Non-JSON state retains the snapshot compatibility path
 * so legacy reference semantics remain intact.
 */
export const history =
  <T extends object>(options: HistoryOptions<T> = {}): Middleware<T> =>
  (store: Store<T>) => {
    if (
      typeof store.subscribe !== 'function' ||
      typeof store.apply !== 'function' ||
      typeof store.destroy !== 'function'
    ) {
      return snapshotHistory(options)(store);
    }
    if (store.share === 'client') {
      throw new Error(
        'history() is not supported in client store mode. Apply history() to the main shared store instead.'
      );
    }
    const { limit = 100 } = options;
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error('history limit must be a non-negative integer.');
    }
    const middlewareSetState = store.setState;

    let activeApi: HistoryApi<T> | undefined;
    let patchHistoryDestroy: (() => void) | undefined;
    let runWithoutRecording: (<R>(callback: () => R) => R) | undefined;
    const api: HistoryApi<T> = {
      undo: () => activeApi?.undo() ?? false,
      redo: () => activeApi?.redo() ?? false,
      clear: () => activeApi?.clear(),
      canUndo: () => activeApi?.canUndo() ?? false,
      canRedo: () => activeApi?.canRedo() ?? false,
      getPast: () => activeApi?.getPast() ?? [],
      getFuture: () => activeApi?.getFuture() ?? [],
      getPatches: () => activeApi?.getPatches()
    };
    Object.assign(store, { history: api });

    const suppressionRunner = <R>(callback: () => R): R =>
      runWithoutRecording ? runWithoutRecording(callback) : callback();
    Object.defineProperty(store, historySuppressionSymbol, {
      configurable: true,
      value: suppressionRunner
    });

    const cancelReady = onStoreReady(store, () => {
      const initialHistoryState = options.partialize
        ? toSnapshot(options.partialize(store.getPureState()))
        : store.getPureState();
      if (!isTravelCompatibleState(initialHistoryState)) {
        const metadataStore = store as unknown as Record<symbol, unknown>;
        if (metadataStore[historySuppressionSymbol] === suppressionRunner) {
          delete metadataStore[historySuppressionSymbol];
        }
        snapshotHistory(options)(store);
        activeApi = (store as unknown as { history: HistoryApi<T> }).history;
        Object.assign(store, { history: api });
        return;
      }
      const patchHistory = createPatchHistory(
        store,
        limit,
        middlewareSetState,
        options.partialize
      );
      activeApi = patchHistory.api;
      patchHistoryDestroy = patchHistory.destroy;
      runWithoutRecording = patchHistory.runWithoutRecording;
    });

    const baseDestroy = store.destroy;
    let destroyed = false;
    store.destroy = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      cancelReady();
      patchHistoryDestroy?.();
      patchHistoryDestroy = undefined;
      const metadataStore = store as unknown as Record<symbol, unknown>;
      if (metadataStore[historySuppressionSymbol] === suppressionRunner) {
        delete metadataStore[historySuppressionSymbol];
      }
      baseDestroy();
    };
    return store;
  };
