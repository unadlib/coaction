import * as React from 'react';
import { create as createVanilla } from 'coaction';
import {
  createReactiveTracker,
  type ReactiveTracker,
  wrapStore
} from 'coaction/adapter';
import type {
  Slice,
  Store,
  StoreOptions,
  ClientStoreOptions,
  SliceState,
  ISlices,
  Asyncify
} from 'coaction';
// Keep the shim so one published build works across React 17/18/19.
// Switching to `react` directly would be a breaking change for React 17 users.
import { useSyncExternalStore } from 'use-sync-external-store/shim';

export * from 'coaction';

type SelectorOptions = {
  autoSelector?: boolean;
};

type SelectorFn<TState extends object, TValue> = (state: TState) => TValue;
type ObserverRender<P extends object> = ((props: P) => React.ReactNode) & {
  displayName?: string;
  name?: string;
};
type ObserverTrackerState = {
  getSnapshot: () => number;
  subscribe: (listener: () => void) => () => void;
  commit: () => void;
  track: <T>(render: () => T) => T;
  dispose: () => void;
};
type TrackedRender = {
  tracker: ReactiveTracker;
  snapshot: number;
};

let observerRenderDepth = 0;
const observerUncommittedCleanupMs = 10_000;
const reactStoreVersionSymbol = Symbol.for('coaction.react.storeVersion');

const isObserverRendering = () => observerRenderDepth > 0;

const isReactNativeEnvironment = () =>
  typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

const canTrackObserverRender = () =>
  typeof window !== 'undefined' || isReactNativeEnvironment();

const useObserverCommitEffect =
  canTrackObserverRender() && React.useLayoutEffect
    ? React.useLayoutEffect
    : React.useEffect;

const runObserverRender = <T>(render: () => T) => {
  observerRenderDepth += 1;
  try {
    return render();
  } finally {
    observerRenderDepth -= 1;
  }
};

const getObserverDisplayName = (Component: ObserverRender<object>) =>
  Component.displayName ?? Component.name ?? 'Component';

const createObserverTrackerState = (): ObserverTrackerState => {
  let activeTracker: ReactiveTracker | undefined;
  let activeUnsubscribe: (() => void) | undefined;
  let activeSnapshot: number | undefined;
  let latestRender: TrackedRender | undefined;
  let version = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const cleanupHandles = new Map<
    ReactiveTracker,
    ReturnType<typeof setTimeout>
  >();

  const notify = (snapshot?: number) => {
    if (disposed) {
      return;
    }
    if (activeTracker) {
      activeSnapshot = snapshot ?? activeTracker.getSnapshot();
    }
    version += 1;
    listeners.forEach((listener) => listener());
  };
  const syncActiveSnapshot = () => {
    if (!activeTracker || activeSnapshot === undefined) {
      return;
    }
    const snapshot = activeTracker.getSnapshot();
    if (snapshot !== activeSnapshot) {
      notify(snapshot);
    }
  };
  const clearTrackerCleanup = (tracker: ReactiveTracker) => {
    const cleanupHandle = cleanupHandles.get(tracker);
    if (cleanupHandle !== undefined) {
      clearTimeout(cleanupHandle);
      cleanupHandles.delete(tracker);
    }
  };
  const disposeTracker = (tracker: ReactiveTracker) => {
    clearTrackerCleanup(tracker);
    tracker.dispose();
  };
  const scheduleTrackerCleanup = (tracker: ReactiveTracker) => {
    clearTrackerCleanup(tracker);
    if (!canTrackObserverRender()) {
      return;
    }
    const cleanupHandle = setTimeout(() => {
      cleanupHandles.delete(tracker);
      if (activeTracker === tracker) {
        activeUnsubscribe?.();
        activeUnsubscribe = undefined;
        activeTracker = undefined;
        activeSnapshot = undefined;
      }
      if (latestRender?.tracker === tracker) {
        latestRender = undefined;
      }
      tracker.dispose();
    }, observerUncommittedCleanupMs);
    (cleanupHandle as { unref?: () => void }).unref?.();
    cleanupHandles.set(tracker, cleanupHandle);
  };
  const unsubscribeActiveTracker = () => {
    activeUnsubscribe?.();
    activeUnsubscribe = undefined;
  };
  const subscribeActiveTracker = () => {
    unsubscribeActiveTracker();
    if (!activeTracker || listeners.size === 0 || disposed) {
      return;
    }
    activeUnsubscribe = activeTracker.subscribe(notify);
    syncActiveSnapshot();
  };
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    unsubscribeActiveTracker();
    listeners.clear();
    const trackers = new Set<ReactiveTracker>();
    cleanupHandles.forEach((cleanupHandle, tracker) => {
      clearTimeout(cleanupHandle);
      trackers.add(tracker);
    });
    cleanupHandles.clear();
    if (activeTracker) {
      trackers.add(activeTracker);
    }
    if (latestRender) {
      trackers.add(latestRender.tracker);
    }
    activeTracker = undefined;
    activeSnapshot = undefined;
    latestRender = undefined;
    trackers.forEach((tracker) => tracker.dispose());
  };
  return {
    getSnapshot: () => version,
    subscribe(listener) {
      if (disposed) {
        return () => undefined;
      }
      listeners.add(listener);
      if (activeTracker) {
        clearTrackerCleanup(activeTracker);
      }
      if (listeners.size === 1) {
        subscribeActiveTracker();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribeActiveTracker();
          if (activeTracker) {
            scheduleTrackerCleanup(activeTracker);
          }
        }
      };
    },
    commit() {
      if (disposed || !latestRender) {
        return;
      }
      const { tracker, snapshot } = latestRender;
      latestRender = undefined;
      clearTrackerCleanup(tracker);
      if (activeTracker !== tracker) {
        const previousTracker = activeTracker;
        unsubscribeActiveTracker();
        activeTracker = tracker;
        activeSnapshot = snapshot;
        subscribeActiveTracker();
        if (listeners.size === 0) {
          scheduleTrackerCleanup(tracker);
        }
        if (previousTracker) {
          disposeTracker(previousTracker);
        }
      }
      syncActiveSnapshot();
    },
    track<T>(render: () => T) {
      if (disposed || !canTrackObserverRender()) {
        return runObserverRender(render);
      }
      const tracker = createReactiveTracker();
      scheduleTrackerCleanup(tracker);
      try {
        const value = tracker.track(() => runObserverRender(render));
        latestRender = {
          tracker,
          snapshot: tracker.getSnapshot()
        };
        return value;
      } catch (error) {
        latestRender = {
          tracker,
          snapshot: tracker.getSnapshot()
        };
        throw error;
      }
    },
    dispose
  };
};

const useObserverTracker = () => {
  const trackerRef = React.useRef<ObserverTrackerState | undefined>(undefined);
  if (!trackerRef.current) {
    trackerRef.current = createObserverTrackerState();
  }
  const trackerState = trackerRef.current;
  useSyncExternalStore(
    trackerState.subscribe,
    trackerState.getSnapshot,
    () => 0
  );
  useObserverCommitEffect(() => {
    trackerState.commit();
  });
  return trackerState;
};

export const observer = <P extends object>(
  Component: ObserverRender<P>
): React.MemoExoticComponent<ObserverRender<P>> => {
  const Observed = (props: P) => {
    const trackerState = useObserverTracker();
    return trackerState.track(() => Component(props));
  };
  Observed.displayName = `observer(${getObserverDisplayName(
    Component as ObserverRender<object>
  )})`;
  return React.memo(Observed);
};

export type ObserverProps = {
  children: () => React.ReactNode;
};

export const Observer = observer<ObserverProps>(({ children }) =>
  React.createElement(React.Fragment, null, children())
);

type LeafObject =
  | Date
  | RegExp
  | Error
  | Promise<unknown>
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
  | ArrayBuffer
  | DataView;

export type AutoSelector<TState extends object, TValue> = SelectorFn<
  TState,
  TValue
> &
  (TValue extends (...args: any[]) => any
    ? {}
    : TValue extends readonly any[]
      ? {}
      : TValue extends LeafObject
        ? {}
        : TValue extends object
          ? {
              [K in keyof TValue]: AutoSelector<TState, TValue[K]>;
            }
          : {});

export type AutoSelectors<T extends object> = {
  [K in keyof T]: AutoSelector<T, T[K]>;
};

export type StoreReturn<T extends object> = Store<T> & {
  <P>(selector: (state: T) => P): P;
  (options: { autoSelector: true }): AutoSelectors<T>;
  (options?: SelectorOptions): T;
  auto: () => AutoSelectors<T>;
};

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Omit<Store<Asyncify<T, D>>, 'getInitialState'> & {
  getInitialState: () => T;
  <P>(selector: (state: Asyncify<T, D>) => P): P;
  (options: { autoSelector: true }): AutoSelectors<Asyncify<T, D>>;
  (options?: SelectorOptions): Asyncify<T, D>;
  auto: () => AutoSelectors<Asyncify<T, D>>;
};

export type CreateState = ISlices | Record<PropertyKey, Slice<any>>;

type SingleStoreOptions<T extends CreateState> = StoreOptions<T> & {
  sliceMode: 'single';
};

type SingleClientStoreOptions<T extends CreateState> = ClientStoreOptions<T> & {
  sliceMode: 'single';
};

export type Creator = {
  <T extends ISlices>(
    createState: T,
    options: SingleClientStoreOptions<T>
  ): StoreWithAsyncFunction<T>;
  <T extends Record<PropertyKey, Slice<any>>>(
    createState: T,
    options: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<SliceState<T>, true>;
  <T extends ISlices>(
    createState: Slice<T> | T,
    options: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<T>;
  <T extends ISlices>(
    createState: T,
    options: SingleStoreOptions<T>
  ): StoreReturn<T>;
  <T extends Record<PropertyKey, Slice<any>>>(
    createState: T,
    options?: StoreOptions<T>
  ): StoreReturn<SliceState<T>>;
  <T extends ISlices>(
    createState: Slice<T> | T,
    options?: StoreOptions<T>
  ): StoreReturn<T>;
};

const getPathValue = (state: unknown, path: PropertyKey[]) => {
  let current = state as Record<PropertyKey, unknown> | undefined;
  for (const key of path) {
    if (
      (typeof current !== 'object' && typeof current !== 'function') ||
      current === null
    ) {
      return undefined;
    }
    current = current[key] as Record<PropertyKey, unknown> | undefined;
  }
  return current;
};

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );

const isPlainObject = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const createSelectorNode = <T extends object>(
  path: PropertyKey[],
  value: unknown,
  ancestors: object[] = []
): AutoSelector<T, unknown> => {
  const selector = ((state: T) => {
    return getPathValue(state, path);
  }) as AutoSelector<T, unknown>;
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !isPlainObject(value)
  ) {
    return selector;
  }
  if (ancestors.includes(value)) {
    return selector;
  }
  const nextAncestors = [...ancestors, value];
  const childDescriptors = {} as Record<PropertyKey, PropertyDescriptor>;
  for (const key of getOwnEnumerableKeys(value)) {
    childDescriptors[key] = {
      value: createSelectorNode<T>(
        [...path, key],
        (value as Record<PropertyKey, unknown>)[key],
        nextAncestors
      ),
      enumerable: true
    };
  }
  return Object.defineProperties(selector, childDescriptors);
};

const createAutoSelectors = <T extends object>(store: Store<T>) => {
  const state = store.getState();
  if (typeof state !== 'object' || state === null) {
    return {} as AutoSelectors<T>;
  }
  const selectors = {} as Record<PropertyKey, AutoSelector<T, unknown>>;
  for (const key of getOwnEnumerableKeys(state)) {
    selectors[key] = createSelectorNode<T>(
      [key],
      (state as Record<PropertyKey, unknown>)[key]
    );
  }
  return selectors as AutoSelectors<T>;
};

const touchState = (value: unknown, seen = new WeakSet<object>()) => {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => touchState(item, seen));
    return;
  }
  for (const key of getOwnEnumerableKeys(value)) {
    touchState((value as Record<PropertyKey, unknown>)[key], seen);
  }
};

const createReactiveSelector = <TState extends object, TValue>(
  store: Store<TState>,
  selector: SelectorFn<TState, TValue>,
  getVersion: () => number
) => {
  return {
    createSubscription() {
      let currentVersion = getVersion();
      let currentValue = selector(store.getState());
      const serverValue = selector(store.getInitialState());
      const readSnapshot = () => {
        const nextVersion = getVersion();
        if (nextVersion !== currentVersion) {
          currentVersion = nextVersion;
          currentValue = selector(store.getState());
        }
        return currentValue;
      };
      const notifyIfChanged = (listener: () => void) => {
        currentVersion = getVersion();
        const nextValue = selector(store.getState());
        if (!Object.is(currentValue, nextValue)) {
          currentValue = nextValue;
          listener();
        }
      };
      return {
        getSnapshot: readSnapshot,
        getServerSnapshot: () => serverValue,
        subscribe(listener: () => void) {
          const unsubscribe = store.subscribe(() => {
            notifyIfChanged(listener);
          });
          return unsubscribe;
        }
      };
    }
  };
};

export const create: Creator = (createState: any, options: any) => {
  const store = createVanilla(createState, options);
  let fullStateVersion = 0;
  const fullStateListeners = new Set<() => void>();
  let isTrackingSubscriptionSetup = true;
  const unsubscribeVersion = store.subscribe(() => {
    touchState(store.getPureState());
    if (isTrackingSubscriptionSetup) {
      return;
    }
    fullStateVersion += 1;
    fullStateListeners.forEach((listener) => listener());
  });
  isTrackingSubscriptionSetup = false;
  const baseDestroy = store.destroy;
  let destroyed = false;
  store.destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unsubscribeVersion();
    fullStateListeners.clear();
    baseDestroy();
  };
  const subscribeFullState = (listener: () => void) => {
    fullStateListeners.add(listener);
    return () => fullStateListeners.delete(listener);
  };
  let autoSelectors: AutoSelectors<any> | undefined;
  const getAutoSelectors = () => {
    if (!autoSelectors) {
      autoSelectors = createAutoSelectors(store);
    }
    return autoSelectors;
  };
  const reactiveSelectors = new WeakMap<
    SelectorFn<any, any>,
    ReturnType<typeof createReactiveSelector<any, any>>
  >();
  const getReactiveSelector = (selector: SelectorFn<any, any>) => {
    let reactiveSelector = reactiveSelectors.get(selector);
    if (!reactiveSelector) {
      reactiveSelector = createReactiveSelector(
        store,
        selector,
        () => fullStateVersion
      );
      reactiveSelectors.set(selector, reactiveSelector);
    }
    return reactiveSelector;
  };
  const useStore = wrapStore(store, (selector: any) => {
    if (typeof selector === 'function') {
      const reactiveSelector = getReactiveSelector(selector);
      const subscription = reactiveSelector.createSubscription();
      return useSyncExternalStore(
        subscription.subscribe,
        subscription.getSnapshot,
        subscription.getServerSnapshot
      );
    }
    if (selector?.autoSelector) {
      return getAutoSelectors();
    }
    if (isObserverRendering()) {
      return store.getState();
    }
    useSyncExternalStore(
      subscribeFullState,
      () => fullStateVersion,
      () => 0
    );
    return store.getState();
  }) as StoreReturn<any>;
  Object.defineProperty(useStore, reactStoreVersionSymbol, {
    value: () => fullStateVersion
  });
  useStore.auto = getAutoSelectors;
  return useStore;
};

type ExtractState<T extends StoreReturn<any>[]> = {
  [K in keyof T]: ReturnType<T[K]['getState']>;
};

interface CreateSelector {
  <T extends StoreReturn<any>[]>(
    ...stores: T
  ): <P>(selector: (...args: ExtractState<T>) => P) => P;
}

const areVersionsEqual = (left: number[], right: number[]) =>
  left.length === right.length &&
  left.every((value, index) => Object.is(value, right[index]));

const readReactStoreVersion = (store: StoreReturn<any>) => {
  const getVersion = (store as any)[reactStoreVersionSymbol];
  return typeof getVersion === 'function'
    ? (getVersion() as number)
    : undefined;
};

/**
 * create selector for multiple stores
 */
export const createSelector: CreateSelector = (
  ...stores: StoreReturn<any>[]
) => {
  return (selector: (...args: any[]) => any) => {
    const fallbackVersions = stores.map(() => 0);
    const readStoreVersion = (store: StoreReturn<any>, index: number) =>
      readReactStoreVersion(store) ?? fallbackVersions[index];
    const readVersions = () => stores.map(readStoreVersion);
    const readSelected = (readStore: (store: StoreReturn<any>) => unknown) =>
      selector.apply(
        null,
        stores.map((store) => readStore(store))
      );
    let currentVersions = readVersions();
    let currentValue = readSelected((store) => store.getState());
    const serverValue = readSelected((store) => store.getInitialState());
    const readSnapshot = () => {
      const nextVersions = readVersions();
      if (!areVersionsEqual(currentVersions, nextVersions)) {
        currentVersions = nextVersions;
        currentValue = readSelected((store) => store.getState());
      }
      return currentValue;
    };
    const notifyIfChanged = (listener: () => void) => {
      const nextVersions = readVersions();
      const nextValue = readSelected((store) => store.getState());
      currentVersions = nextVersions;
      if (!Object.is(currentValue, nextValue)) {
        currentValue = nextValue;
        listener();
      }
    };
    return useSyncExternalStore(
      (callback) => {
        const callbacks = stores.map((store, index) =>
          store.subscribe(() => {
            if (typeof readReactStoreVersion(store) === 'undefined') {
              fallbackVersions[index] += 1;
            }
            notifyIfChanged(callback);
          })
        );
        return () => callbacks.forEach((cb) => cb());
      },
      readSnapshot,
      () => serverValue
    );
  };
};
