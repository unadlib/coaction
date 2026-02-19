import { create as createVanilla, wrapStore } from 'coaction';
import type {
  Asyncify,
  ClientStoreOptions,
  ISlices,
  Listener,
  Slice,
  SliceState,
  Store,
  StoreOptions
} from 'coaction';

export * from 'coaction';

type Unsubscriber = () => void;

type Readable<T> = {
  subscribe: (
    run: (value: T) => void,
    invalidate?: (value?: T) => void
  ) => Unsubscriber;
};

export type StoreReturn<T extends object> = Store<T> & {
  (): T;
  <P>(selector: (state: T) => P): Readable<P>;
  subscribe: {
    (listener: Listener): Unsubscriber;
    (run: (value: T) => void, invalidate?: (value?: T) => void): Unsubscriber;
  };
  select: <P>(selector: (state: T) => P) => Readable<P>;
};

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Store<Asyncify<T, D>> & {
  (): Asyncify<T, D>;
  <P>(selector: (state: Asyncify<T, D>) => P): Readable<P>;
  subscribe: {
    (listener: Listener): Unsubscriber;
    (
      run: (value: Asyncify<T, D>) => void,
      invalidate?: (value?: Asyncify<T, D>) => void
    ): Unsubscriber;
  };
  select: <P>(selector: (state: Asyncify<T, D>) => P) => Readable<P>;
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

const createReadable = <T extends object, P>(
  store: Store<T>,
  selector: (state: T) => P
): Readable<P> => ({
  subscribe(run) {
    run(selector(store.getState()));
    return store.subscribe(() => {
      run(selector(store.getState()));
    });
  }
});

export const create: Creator = (createState: any, options: any) => {
  const store = createVanilla(createState, options);
  const baseSubscribe = store.subscribe.bind(store);
  const select = <P>(selector: (state: any) => P) =>
    createReadable(store as Store<any>, selector);
  const subscribe = ((listener: any, invalidate?: any) => {
    if (typeof invalidate === 'function') {
      invalidate();
    }
    if (typeof listener === 'function' && listener.length > 0) {
      listener(store.getState());
      return baseSubscribe(() => {
        listener(store.getState());
      });
    }
    return baseSubscribe(listener);
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
