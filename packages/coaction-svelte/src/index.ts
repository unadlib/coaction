import { create as createVanilla } from 'coaction/shared';
import { wrapStore } from 'coaction/adapter';
import type {
  Asyncify,
  ClientStoreOptions,
  ISlices,
  Slice,
  SliceState,
  Store,
  StoreOptions
} from 'coaction/shared';

export * from 'coaction/shared';

type Unsubscriber = () => void;

type Readable<T> = {
  subscribe: (
    run: (value: T) => void,
    invalidate?: (value?: T) => void
  ) => Unsubscriber;
};

export type StoreReturn<T extends object> = Omit<Store<T>, 'subscribe'> & {
  (): T;
  <P>(selector: (state: T) => P): Readable<P>;
  subscribe: Readable<T>['subscribe'];
  select: <P>(selector: (state: T) => P) => Readable<P>;
};

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Omit<Store<Asyncify<T, D>>, 'getInitialState' | 'subscribe'> & {
  getInitialState: () => T;
  (): Asyncify<T, D>;
  <P>(selector: (state: Asyncify<T, D>) => P): Readable<P>;
  subscribe: Readable<Asyncify<T, D>>['subscribe'];
  select: <P>(selector: (state: Asyncify<T, D>) => P) => Readable<P>;
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

const createReadable = <T extends object, P>(
  store: Store<T>,
  selector: (state: T) => P,
  subscribeStore: Store<T>['subscribe'] = store.subscribe.bind(store)
): Readable<P> => ({
  subscribe(run, invalidate) {
    run(selector(store.getState()));
    return subscribeStore(() => {
      const value = selector(store.getState());
      invalidate?.(value);
      run(value);
    });
  }
});

export const create: Creator = (createState: any, options: any) => {
  const store = createVanilla(createState, options);
  const baseSubscribe = store.subscribe.bind(store);
  function select<P>(selector: (state: any) => P) {
    return createReadable(store as Store<any>, selector, baseSubscribe);
  }
  const subscribe = ((run: any, invalidate?: any) => {
    run(store.getState());
    return baseSubscribe(() => {
      const state = store.getState();
      invalidate?.(state);
      run(state);
    });
  }) as StoreReturn<any>['subscribe'];
  Object.assign(store, {
    subscribe,
    select
  });
  return wrapStore(store, (selector: any) => {
    if (typeof selector === 'function') {
      return select(selector);
    }
    return store.getState();
  }) as any;
};
