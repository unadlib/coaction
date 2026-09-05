import * as React from 'react';
import {
  createReactiveTracker,
  getReadonlyStateValueVersion,
  trackReadonlyStateValue,
  type ReactiveTracker,
  wrapStore
} from 'coaction/adapter';
import type {
  Asyncify,
  ISlices,
  LocalStoreOptions,
  Slice,
  SliceState,
  Store,
  StoreOptions
} from 'coaction';
// Only the shared entry publishes the client-mode option type. The import is
// type-only, so naming it here does not pull the transport build into the
// default one.
import type { ClientStoreOptions } from 'coaction/shared';
// Keep the shim so one published build works across React 17/18/19.
// Switching to `react` directly would be a breaking change for React 17 users.
import { useSyncExternalStore } from 'use-sync-external-store/shim';

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
};
type TrackedRender = {
  tracker: ReactiveTracker;
  snapshot: number;
};
type TrackedSelection<TState extends object, TValue> = TrackedRender & {
  selector: SelectorFn<TState, TValue>;
  value: TValue;
  stateObjectVersion?: number;
  reactive: boolean;
};
type SelectorTrackerState<TState extends object> = {
  getSnapshot: () => number;
  getServerSnapshot: () => number;
  subscribe: (listener: () => void) => () => void;
  track: <TValue>(selector: SelectorFn<TState, TValue>) => TValue;
  commit: () => void;
};

let observerRenderDepth = 0;
// A render may never commit (Suspense, StrictMode replay, a discarded
// transition), so a tracker created during one is held for a while before its
// path nodes are released.
const observerUncommittedCleanupMs = 10_000;
// Once React drops the last subscriber the component is unmounted or hidden,
// which is a definite signal rather than a guess, so its path nodes are
// released on the next macrotask instead. Anything that resubscribes -- the
// second half of a StrictMode replay, a remounted Offscreen subtree -- cancels
// the pending release synchronously, before a timer can run.
const observerReleaseCleanupMs = 0;

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

/**
 * Record the state values a selector result carries, and fold their versions
 * into one token.
 *
 * The dependency alone is not enough when the result is a wrapper the selector
 * reuses. The subscription fires, the selector runs again, and the comparison
 * then sees the same wrapper reference and concludes nothing changed -- exactly
 * what `stateObjectVersion` already compensates for when the state value is
 * returned directly. The fold is sensitive to each version, to how many values
 * there are, and to the order they were found in.
 */
const trackReturnedStateValues = (value: unknown) => {
  const seen = new WeakSet<object>();
  let aggregate = 0;
  const visit = (current: unknown) => {
    if (
      (typeof current !== 'object' && typeof current !== 'function') ||
      !current
    ) {
      return;
    }
    const object = current as object;
    if (seen.has(object)) return;
    seen.add(object);
    // A Coaction state proxy/facade is already a terminal path dependency.
    // Do not traverse large state arrays/objects merely because they escaped
    // through a React prop.
    if (trackReadonlyStateValue(current)) {
      const version = getReadonlyStateValueVersion(current);
      if (version !== undefined) {
        aggregate = (Math.imul(aggregate, 31) + version) | 0;
      }
      return;
    }
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (React.isValidElement(current)) {
      const props = current.props as Record<PropertyKey, unknown> | null;
      if (!props) return;
      for (const key of Reflect.ownKeys(props)) {
        visit(props[key]);
      }
      return;
    }
    // A plain object the caller built -- `{ user: state.user, name: ... }` --
    // carries state values out with it. Without walking it, reading a deeper
    // leaf makes path minimisation drop the ancestor as a mere traversal step,
    // and the object in the result then never invalidates. Traversal stops at
    // the first state value, so this only walks what the caller wrote.
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) return;
    const record = current as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(record)) {
      visit(record[key]);
    }
  };
  visit(value);
  return aggregate;
};

const getObserverDisplayName = (Component: ObserverRender<object>) =>
  Component.displayName ?? Component.name ?? 'Component';

const createObserverTrackerState = (): ObserverTrackerState => {
  let activeTracker: ReactiveTracker | undefined;
  let activeUnsubscribe: (() => void) | undefined;
  let activeSnapshot: number | undefined;
  let latestRender: TrackedRender | undefined;
  let version = 0;
  const listeners = new Set<() => void>();
  const cleanupHandles = new Map<
    ReactiveTracker,
    ReturnType<typeof setTimeout>
  >();

  const notify = (snapshot?: number) => {
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
  const scheduleTrackerCleanup = (
    tracker: ReactiveTracker,
    delayMs = observerUncommittedCleanupMs
  ) => {
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
    }, delayMs);
    (cleanupHandle as { unref?: () => void }).unref?.();
    cleanupHandles.set(tracker, cleanupHandle);
  };
  const unsubscribeActiveTracker = () => {
    activeUnsubscribe?.();
    activeUnsubscribe = undefined;
  };
  const subscribeActiveTracker = () => {
    unsubscribeActiveTracker();
    if (!activeTracker || listeners.size === 0) {
      return;
    }
    activeUnsubscribe = activeTracker.subscribe(notify);
    syncActiveSnapshot();
  };
  return {
    getSnapshot: () => version,
    subscribe(listener) {
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
            scheduleTrackerCleanup(activeTracker, observerReleaseCleanupMs);
          }
        }
      };
    },
    commit() {
      if (!latestRender) {
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
      if (!canTrackObserverRender()) {
        return runObserverRender(render);
      }
      const tracker = createReactiveTracker();
      scheduleTrackerCleanup(tracker);
      try {
        const value = tracker.track(() => {
          const rendered = runObserverRender(render);
          trackReturnedStateValues(rendered);
          return rendered;
        });
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
    }
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

const createSelectorTrackerState = <TState extends object>(
  store: Store<TState>
): SelectorTrackerState<TState> => {
  let activeSelection: TrackedSelection<TState, any> | undefined;
  let activeUnsubscribe: (() => void) | undefined;
  let latestRender: TrackedSelection<TState, any> | undefined;
  let version = 0;
  const listeners = new Set<() => void>();
  const cleanupHandles = new Map<
    ReactiveTracker,
    ReturnType<typeof setTimeout>
  >();

  const clearCleanup = (tracker: ReactiveTracker) => {
    const handle = cleanupHandles.get(tracker);
    if (handle !== undefined) {
      clearTimeout(handle);
      cleanupHandles.delete(tracker);
    }
  };
  const disposeSelection = (
    selection: TrackedSelection<TState, any> | undefined
  ) => {
    if (!selection) return;
    clearCleanup(selection.tracker);
    selection.tracker.dispose();
  };
  const scheduleCleanup = (
    selection: TrackedSelection<TState, any>,
    delayMs = observerUncommittedCleanupMs
  ) => {
    clearCleanup(selection.tracker);
    if (!canTrackObserverRender()) return;
    const handle = setTimeout(() => {
      cleanupHandles.delete(selection.tracker);
      if (activeSelection?.tracker === selection.tracker) {
        activeUnsubscribe?.();
        activeUnsubscribe = undefined;
        activeSelection = undefined;
      }
      if (latestRender?.tracker === selection.tracker) {
        latestRender = undefined;
      }
      selection.tracker.dispose();
    }, delayMs);
    (handle as { unref?: () => void }).unref?.();
    cleanupHandles.set(selection.tracker, handle);
  };
  const evaluate = <TValue>(
    selector: SelectorFn<TState, TValue>
  ): TrackedSelection<TState, TValue> => {
    const tracker = createReactiveTracker();
    try {
      let stateObjectVersion: number | undefined;
      const value = tracker.track(() => {
        const selected = selector(store.getState());
        if (trackReadonlyStateValue(selected)) {
          stateObjectVersion = getReadonlyStateValueVersion(selected);
        } else {
          // A composite result carries state values inside a wrapper the
          // selector built; they need the same terminal dependency -- and the
          // same version comparison -- the directly returned one gets, or a
          // wrapper the selector reuses hides every change inside it.
          const carried = trackReturnedStateValues(selected);
          if (carried !== 0) stateObjectVersion = carried;
        }
        return selected;
      });
      return {
        tracker,
        snapshot: tracker.getSnapshot(),
        selector,
        value,
        stateObjectVersion,
        reactive: tracker.hasDependencies()
      };
    } catch (error) {
      // A render-time selector may suspend or throw. It never becomes the
      // committed dependency set, so release its path nodes immediately.
      tracker.dispose();
      throw error;
    }
  };
  const notify = () => {
    version += 1;
    listeners.forEach((listener) => listener());
  };
  const unsubscribeActive = () => {
    activeUnsubscribe?.();
    activeUnsubscribe = undefined;
  };
  /**
   * Point the active subscription at the selection's current source, leaving
   * it alone when the source has not changed. A non-reactive selection stays
   * subscribed to the same store across refreshes, and dropping that listener
   * only to add it straight back is not merely wasted work: stores notify by
   * iterating their listener set, and a listener re-added mid-iteration is
   * visited again by that same iteration, so a selection refreshing on every
   * notification would never stop refreshing.
   */
  const retargetActive = (
    previous: TrackedSelection<TState, any> | undefined,
    next: TrackedSelection<TState, any>
  ) => {
    if (
      activeUnsubscribe &&
      listeners.size &&
      previous &&
      !previous.reactive &&
      !next.reactive
    ) {
      return;
    }
    unsubscribeActive();
    if (!listeners.size) return;
    activeUnsubscribe = next.reactive
      ? next.tracker.subscribe(refreshActive)
      : store.subscribe(refreshActive);
  };
  const refreshActive = () => {
    const previous = activeSelection;
    if (!previous) return;
    let next: TrackedSelection<TState, any>;
    try {
      next = evaluate(previous.selector);
    } catch {
      // Surface selector failures from the next React render rather than from
      // an external-store notification callback.
      notify();
      return;
    }
    activeSelection = next;
    retargetActive(previous, next);
    // Public root/slice facades intentionally keep stable identity. Compare
    // their path version as well as object identity so an unrelated selector
    // dependency can change without forcing a state-object result to render.
    const changed =
      !Object.is(previous.value, next.value) ||
      (next.stateObjectVersion !== undefined &&
        next.stateObjectVersion !== previous.stateObjectVersion);
    disposeSelection(previous);
    if (changed) {
      notify();
    }
  };
  const subscribeActive = () => {
    unsubscribeActive();
    if (!activeSelection || !listeners.size) return;
    activeUnsubscribe = activeSelection.reactive
      ? activeSelection.tracker.subscribe(refreshActive)
      : store.subscribe(refreshActive);
    if (
      activeSelection.reactive &&
      activeSelection.tracker.getSnapshot() !== activeSelection.snapshot
    ) {
      refreshActive();
    }
  };

  return {
    getSnapshot: () => version,
    getServerSnapshot: () => 0,
    subscribe(listener) {
      listeners.add(listener);
      if (activeSelection) clearCleanup(activeSelection.tracker);
      if (listeners.size === 1) subscribeActive();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          unsubscribeActive();
          if (activeSelection) {
            scheduleCleanup(activeSelection, observerReleaseCleanupMs);
          }
        }
      };
    },
    track<TValue>(selector: SelectorFn<TState, TValue>) {
      if (!canTrackObserverRender()) {
        return selector(store.getInitialState());
      }
      const selection = evaluate(selector);
      scheduleCleanup(selection);
      latestRender = selection;
      return selection.value;
    },
    commit() {
      const rendered = latestRender;
      if (!rendered) return;
      latestRender = undefined;
      clearCleanup(rendered.tracker);
      let next = rendered;
      let renderedValueStale = false;
      if (
        !rendered.reactive ||
        rendered.tracker.getSnapshot() !== rendered.snapshot
      ) {
        const refreshed = evaluate(rendered.selector);
        renderedValueStale =
          !Object.is(rendered.value, refreshed.value) ||
          (refreshed.stateObjectVersion !== undefined &&
            refreshed.stateObjectVersion !== rendered.stateObjectVersion);
        disposeSelection(rendered);
        next = refreshed;
      }
      const previous = activeSelection;
      activeSelection = next;
      retargetActive(previous, next);
      if (!listeners.size) {
        scheduleCleanup(next);
      }
      if (previous && previous.tracker !== next.tracker) {
        disposeSelection(previous);
      }
      if (renderedValueStale) {
        notify();
      }
    }
  };
};

const useTrackedSelector = <TState extends object, TValue>(
  store: Store<TState>,
  selector: SelectorFn<TState, TValue>
) => {
  const trackerRef = React.useRef<SelectorTrackerState<TState> | undefined>(
    undefined
  );
  if (!trackerRef.current) {
    trackerRef.current = createSelectorTrackerState(store);
  }
  const trackerState = trackerRef.current;
  const selected = trackerState.track(selector);
  useSyncExternalStore(
    trackerState.subscribe,
    trackerState.getSnapshot,
    trackerState.getServerSnapshot
  );
  useObserverCommitEffect(() => {
    trackerState.commit();
  });
  return selected;
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

type SingleLocalStoreOptions<T extends CreateState> = LocalStoreOptions<T> & {
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

export type LocalCreator = {
  <T extends ISlices>(
    createState: T,
    options: SingleLocalStoreOptions<T>
  ): StoreReturn<T>;
  <T extends Record<PropertyKey, Slice<any>>>(
    createState: T,
    options?: LocalStoreOptions<T>
  ): StoreReturn<SliceState<T>>;
  <T extends ISlices>(
    createState: Slice<T> | T,
    options?: LocalStoreOptions<T>
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

export const createReactStore = (
  createVanilla: (createState: any, options?: any) => Store<any>,
  createState: any,
  options: any
) => {
  const store = createVanilla(createState, options);
  let fullStateVersion = 0;
  const fullStateListeners = new Set<() => void>();
  let isTrackingSubscriptionSetup = true;
  const unsubscribeVersion = store.subscribe(() => {
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
  const useStore = wrapStore(store, (selector: any) => {
    if (typeof selector === 'function') {
      return useTrackedSelector(store, selector);
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

/**
 * create selector for multiple stores
 */
export const createSelector: CreateSelector = (
  ...stores: StoreReturn<any>[]
) => {
  return (selector: (...args: any[]) => any) => {
    const compositeStore = {
      getState: () => stores.map((store) => store.getState()),
      getInitialState: () => stores.map((store) => store.getInitialState()),
      subscribe: (listener: () => void) => {
        const unsubscribes = stores.map((store) => store.subscribe(listener));
        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
      }
    } as unknown as Store<object>;
    return useTrackedSelector(compositeStore, (states: any) =>
      selector.apply(null, states)
    );
  };
};
