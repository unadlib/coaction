import { computed, signal, type Signal } from '@angular/core';
import { create as createVanilla } from 'coaction';
import type {
  Asyncify,
  ClientStoreOptions,
  ISlices,
  Slice,
  SliceState,
  Store,
  StoreOptions
} from 'coaction';

export * from 'coaction';

export type StoreReturn<T extends object> = Store<T> & {
  state: Signal<T>;
  select: <P>(selector: (state: T) => P) => Signal<P>;
};

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Omit<Store<Asyncify<T, D>>, 'getInitialState'> & {
  getInitialState: () => T;
  state: Signal<Asyncify<T, D>>;
  select: <P>(selector: (state: Asyncify<T, D>) => P) => Signal<P>;
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
    options?: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<SliceState<T>, true>;
  <T extends ISlices>(
    createState: Slice<T> | T,
    options?: ClientStoreOptions<T>
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

const alwaysNotify = {
  equal: () => false
};

function attachSignals<T extends object>(store: Store<T>) {
  const version = signal(0);
  const unsubscribe = store.subscribe(() => {
    version.update((value) => value + 1);
  });
  const baseDestroy = store.destroy;
  let destroyed = false;
  store.destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unsubscribe();
    baseDestroy();
  };
  const state = computed(() => {
    version();
    return store.getState();
  }, alwaysNotify);
  function select<P>(selector: (currentState: T) => P) {
    return computed(() => {
      version();
      return selector(store.getState());
    }, alwaysNotify);
  }
  return Object.assign(store, {
    state,
    select
  });
}

export const create: Creator = (createState: any, options: any) => {
  const store = createVanilla(createState, options);
  return attachSignals(store) as any;
};
