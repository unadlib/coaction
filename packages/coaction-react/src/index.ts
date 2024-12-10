import {
  create as createVanilla,
  wrapStore,
  type Slice,
  type Store,
  type StoreOptions,
  type ClientStoreOptions,
  type SliceState,
  type ISlices,
  type Asyncify
} from 'coaction';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

export * from 'coaction';

export type StoreReturn<T extends object> = Store<T> &
  (<P>(selector: (state: T) => P) => P);

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Store<Asyncify<T, D>> & (<P>(selector: (state: Asyncify<T, D>) => P) => P);

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
  return wrapStore(store, (selector: any) =>
    useSyncExternalStore(
      store.subscribe,
      () => selector(store.getState()),
      () => selector(store.getInitialState())
    )
  );
};
