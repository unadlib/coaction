import { computed, create as createVanilla, effect, wrapStore } from 'coaction';
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

export type AutoSelector<TState extends object, TValue> = SelectorFn<
  TState,
  TValue
> &
  (TValue extends (...args: any[]) => any
    ? {}
    : TValue extends readonly any[]
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
> = Store<Asyncify<T, D>> & {
  <P>(selector: (state: Asyncify<T, D>) => P): P;
  (options: { autoSelector: true }): AutoSelectors<Asyncify<T, D>>;
  (options?: SelectorOptions): Asyncify<T, D>;
  auto: () => AutoSelectors<Asyncify<T, D>>;
};

export type CreateState = ISlices | Record<string, Slice<any>>;

export type Creator = {
  <T extends Record<string, Slice<any>>>(
    createState: T,
    options?: StoreOptions<T>
  ): StoreReturn<SliceState<T>>;
  <T extends ISlices>(
    createState: Slice<T>,
    options?: StoreOptions<T>
  ): StoreReturn<T>;
  <T extends Record<string, Slice<any>>>(
    createState: T,
    options?: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<SliceState<T>, true>;
  <T extends ISlices>(
    createState: Slice<T>,
    options?: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<T>;
};

const getPathValue = (state: unknown, path: string[]) => {
  let current = state as Record<string, unknown> | undefined;
  for (const key of path) {
    if (
      (typeof current !== 'object' && typeof current !== 'function') ||
      current === null
    ) {
      return undefined;
    }
    current = current[key] as Record<string, unknown> | undefined;
  }
  return current;
};

const createSelectorNode = <T extends object>(
  path: string[],
  value: unknown,
  ancestors: object[] = []
): AutoSelector<T, unknown> => {
  const selector = ((state: T) => {
    return getPathValue(state, path);
  }) as AutoSelector<T, unknown>;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return selector;
  }
  if (ancestors.includes(value)) {
    return selector;
  }
  const nextAncestors = [...ancestors, value];
  const childDescriptors: PropertyDescriptorMap = {};
  for (const key of Object.keys(Object.getOwnPropertyDescriptors(value))) {
    childDescriptors[key] = {
      value: createSelectorNode<T>(
        [...path, key],
        (value as Record<string, unknown>)[key],
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
  const selectors = {} as Record<string, AutoSelector<T, unknown>>;
  for (const key of Object.keys(Object.getOwnPropertyDescriptors(state))) {
    selectors[key] = createSelectorNode<T>(
      [key],
      (state as Record<string, unknown>)[key]
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
  for (const key of Object.keys(value as Record<string, unknown>)) {
    touchState((value as Record<string, unknown>)[key], seen);
  }
};

const createReactiveSelector = <TState extends object, TValue>(
  store: Store<TState>,
  selector: SelectorFn<TState, TValue>
) => {
  const selected = computed(() => selector(store.getState()));
  return {
    createSubscription() {
      let currentValue = selector(store.getState());
      const notifyIfChanged = (nextValue: TValue, listener: () => void) => {
        if (!Object.is(currentValue, nextValue)) {
          currentValue = nextValue;
          listener();
        }
      };
      return {
        getSnapshot: () => {
          currentValue = selector(store.getState());
          return currentValue;
        },
        subscribe(listener: () => void) {
          let isInitialRun = true;
          currentValue = selector(store.getState());
          const stop = effect(() => {
            const nextValue = selected();
            if (isInitialRun) {
              isInitialRun = false;
              return;
            }
            notifyIfChanged(nextValue, listener);
          });
          const unsubscribe = store.subscribe(() => {
            notifyIfChanged(selector(store.getState()), listener);
          });
          return () => {
            stop();
            unsubscribe();
          };
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
  store.destroy = () => {
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
      reactiveSelector = createReactiveSelector(store, selector);
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
        () => selector(store.getInitialState())
      );
    }
    if (selector?.autoSelector) {
      return getAutoSelectors();
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
    return useSyncExternalStore(
      (callback) => {
        const callbacks = stores.map((store) => store.subscribe(callback));
        return () => callbacks.forEach((cb) => cb());
      },
      () =>
        selector.apply(
          null,
          stores.map((store) => store.getState())
        ),
      () =>
        selector.apply(
          null,
          stores.map((store) => store.getInitialState())
        )
    );
  };
};
