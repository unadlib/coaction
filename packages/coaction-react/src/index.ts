import { create as createVanilla, wrapStore } from 'coaction';
import type {
  Slice,
  Store,
  StoreOptions,
  ClientStoreOptions,
  SliceState,
  ISlices,
  Asyncify
} from 'coaction';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

export * from 'coaction';

export type StoreReturn<T extends object> = Store<T> & {
  <P>(selector: (state: T) => P): P;
  (options?: { autoSelector?: boolean }): T;
};

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Store<Asyncify<T, D>> & {
  <P>(selector: (state: Asyncify<T, D>) => P): P;
  (options?: { autoSelector?: boolean }): Asyncify<T, D>;
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

export const create: Creator = (createState: any, options: any) => {
  const store = createVanilla(createState, options);
  const state = store.getState();
  const storeWithAutoSelector = {} as Record<string, any>;
  if (store.isSliceStore) {
    if (typeof state === 'object' && state !== null) {
      for (const key in state) {
        const sliceState = state[key];
        const descriptors = Object.getOwnPropertyDescriptors(sliceState);
        if (typeof sliceState === 'object' && sliceState !== null) {
          const slice = {};
          for (const subKey in descriptors) {
            const descriptor = descriptors[subKey];
            if (typeof descriptor.get === 'function') {
              descriptor.get = () =>
                useStore(() => store.getState()[key][subKey]);
            }
          }
          Object.defineProperties(slice, descriptors);
          storeWithAutoSelector[key] = slice;
        }
      }
    }
  } else {
    const descriptors = Object.getOwnPropertyDescriptors(state);
    for (const key in descriptors) {
      const descriptor = descriptors[key];
      if (typeof descriptor.get === 'function') {
        descriptor.get = () => useStore(() => store.getState()[key]);
      }
    }
    Object.defineProperties(storeWithAutoSelector, descriptors);
  }
  const useStore = wrapStore(store, (selector: any) => {
    // support auto-selector with useStore({ autoSelector: true })
    return typeof selector === 'function'
      ? useSyncExternalStore(
          store.subscribe,
          () => selector(store.getState()),
          () => selector(store.getInitialState())
        )
      : selector.autoSelector
        ? storeWithAutoSelector
        : store;
  });
  return useStore;
};
