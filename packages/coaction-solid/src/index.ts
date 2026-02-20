import { create as createVanilla, wrapStore } from 'coaction';
import type {
  Asyncify,
  ClientStoreOptions,
  ISlices,
  Slice,
  SliceState,
  Store,
  StoreOptions
} from 'coaction';
import { createSignal, type Accessor } from 'solid-js';

export * from 'coaction';

type SelectorOptions = {
  autoSelector?: boolean;
};

type AutoSelector<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends readonly any[]
      ? Accessor<T[K]>
      : T[K] extends object
        ? AutoSelector<T[K]>
        : Accessor<T[K]>;
};

export type StoreReturn<T extends object> = Store<T> & {
  <P>(selector: (state: T) => P): Accessor<P>;
  (options: { autoSelector: true }): AutoSelector<T>;
  (options?: SelectorOptions): Accessor<T>;
};

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Store<Asyncify<T, D>> & {
  <P>(selector: (state: Asyncify<T, D>) => P): Accessor<P>;
  (options: { autoSelector: true }): AutoSelector<Asyncify<T, D>>;
  (options?: SelectorOptions): Accessor<Asyncify<T, D>>;
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

const createAutoSelector = <T extends object>(
  store: Store<T>,
  getVersion: Accessor<number>
) => {
  const state = store.getState() as Record<string, any>;
  if (!store.isSliceStore) {
    const autoSelector = {} as Record<string, any>;
    const descriptors = Object.getOwnPropertyDescriptors(state);
    for (const key in descriptors) {
      const descriptor = descriptors[key];
      if (typeof descriptor.value === 'function') {
        autoSelector[key] = descriptor.value.bind(state);
      } else {
        autoSelector[key] = () => {
          getVersion();
          return store.getState()[key as keyof T];
        };
      }
    }
    return autoSelector;
  }
  const autoSelector = {} as Record<string, any>;
  for (const sliceKey in state) {
    const slice = state[sliceKey];
    if (typeof slice !== 'object' || slice === null) {
      continue;
    }
    const sliceAutoSelector = {} as Record<string, any>;
    const descriptors = Object.getOwnPropertyDescriptors(slice);
    for (const key in descriptors) {
      const descriptor = descriptors[key];
      if (typeof descriptor.value === 'function') {
        sliceAutoSelector[key] = descriptor.value.bind(slice);
      } else {
        sliceAutoSelector[key] = () => {
          getVersion();
          return (store.getState() as Record<string, any>)[sliceKey][key];
        };
      }
    }
    autoSelector[sliceKey] = sliceAutoSelector;
  }
  return autoSelector;
};

export const create: Creator = (createState: any, options: any) => {
  const store = createVanilla(createState, options);
  const [version, setVersion] = createSignal(0, {
    equals: false
  });
  const unsubscribe = store.subscribe(() => {
    setVersion((value) => value + 1);
  });
  const baseDestroy = store.destroy;
  store.destroy = () => {
    unsubscribe();
    baseDestroy();
  };
  let autoSelector: Record<string, any> | undefined;
  return wrapStore(store, (selector: any) => {
    if (typeof selector === 'function') {
      return () => {
        version();
        return selector(store.getState());
      };
    }
    if (selector?.autoSelector) {
      if (!autoSelector) {
        autoSelector = createAutoSelector(store, version);
      }
      return autoSelector;
    }
    return () => {
      version();
      return store.getState();
    };
  }) as any;
};
