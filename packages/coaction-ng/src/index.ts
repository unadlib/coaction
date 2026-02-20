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
> = Store<Asyncify<T, D>> & {
  state: Signal<Asyncify<T, D>>;
  select: <P>(selector: (state: Asyncify<T, D>) => P) => Signal<P>;
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

function attachSignals<T extends object>(store: Store<T>) {
  const version = signal(0);
  const unsubscribe = store.subscribe(() => {
    version.update((value) => value + 1);
  });
  const baseDestroy = store.destroy;
  store.destroy = () => {
    unsubscribe();
    baseDestroy();
  };
  const state = computed(() => {
    version();
    return store.getState();
  });
  function select<P>(selector: (currentState: T) => P) {
    return computed(() => {
      version();
      return selector(store.getState());
    });
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
