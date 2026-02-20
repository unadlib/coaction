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
import { computed, ref, type ComputedRef, type Ref } from 'vue';

export * from 'coaction';

type SelectorOptions = {
  autoSelector?: boolean;
};

type AutoSelector<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends readonly any[]
      ? ComputedRef<T[K]>
      : T[K] extends object
        ? AutoSelector<T[K]>
        : ComputedRef<T[K]>;
};

export type StoreReturn<T extends object> = Store<T> & {
  <P>(selector: (state: T) => P): ComputedRef<P>;
  (options: { autoSelector: true }): AutoSelector<T>;
  (options?: SelectorOptions): T;
};

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Store<Asyncify<T, D>> & {
  <P>(selector: (state: Asyncify<T, D>) => P): ComputedRef<P>;
  (options: { autoSelector: true }): AutoSelector<Asyncify<T, D>>;
  (options?: SelectorOptions): Asyncify<T, D>;
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

const createStateProxy = <T extends object>(
  store: Store<T>,
  version: Ref<number>
) =>
  new Proxy({} as T, {
    get(_, key) {
      version.value;
      const state = store.getState() as Record<PropertyKey, unknown>;
      const value = state[key];
      if (typeof value === 'function') {
        return value.bind(store.getState());
      }
      return value;
    },
    has(_, key) {
      version.value;
      return key in store.getState();
    },
    ownKeys() {
      version.value;
      return Reflect.ownKeys(store.getState());
    },
    getOwnPropertyDescriptor(_, key) {
      version.value;
      const descriptor = Object.getOwnPropertyDescriptor(store.getState(), key);
      if (!descriptor) {
        return undefined;
      }
      return {
        ...descriptor,
        configurable: true
      };
    }
  });

const createAutoSelector = <T extends object>(
  store: Store<T>,
  version: Ref<number>
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
        autoSelector[key] = computed(() => {
          version.value;
          return store.getState()[key as keyof T];
        });
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
        sliceAutoSelector[key] = computed(() => {
          version.value;
          return (store.getState() as Record<string, any>)[sliceKey][key];
        });
      }
    }
    autoSelector[sliceKey] = sliceAutoSelector;
  }
  return autoSelector;
};

export const create: Creator = (createState: any, options: any) => {
  const store = createVanilla(createState, options);
  const version = ref(0);
  const unsubscribe = store.subscribe(() => {
    version.value += 1;
  });
  const baseDestroy = store.destroy;
  store.destroy = () => {
    unsubscribe();
    baseDestroy();
  };
  const stateProxy = createStateProxy(store, version);
  let autoSelector: Record<string, any> | undefined;
  const useStore = wrapStore(store, (selector: any) => {
    if (typeof selector === 'function') {
      return computed(() => {
        version.value;
        return selector(store.getState());
      });
    }
    if (selector?.autoSelector) {
      if (!autoSelector) {
        autoSelector = createAutoSelector(store, version);
      }
      return autoSelector;
    }
    return stateProxy;
  });
  return useStore as any;
};
