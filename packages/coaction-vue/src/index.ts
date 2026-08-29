import { create as createVanilla } from 'coaction';
import { wrapStore } from 'coaction/adapter';
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

type AutoSelectorValue<T> = T extends (...args: any[]) => any
  ? T
  : T extends readonly any[]
    ? ComputedRef<T>
    : T extends LeafObject
      ? ComputedRef<T>
      : T extends object
        ? AutoSelector<T>
        : ComputedRef<T>;

type AutoSelector<T> = {
  [K in keyof T]: AutoSelectorValue<T[K]>;
};

export type StoreReturn<T extends object> = Store<T> & {
  <P>(selector: (state: T) => P): ComputedRef<P>;
  (options: { autoSelector: true }): AutoSelector<T>;
  (options?: SelectorOptions): T;
};

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Omit<Store<Asyncify<T, D>>, 'getInitialState'> & {
  getInitialState: () => T;
  <P>(selector: (state: Asyncify<T, D>) => P): ComputedRef<P>;
  (options: { autoSelector: true }): AutoSelector<Asyncify<T, D>>;
  (options?: SelectorOptions): Asyncify<T, D>;
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

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );

const isPlainObject = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const directMutationErrorMessage =
  'Direct state mutation is not allowed in immutable Coaction stores. Wrap mutations in set(() => { ... }).';

const createStateProxy = <T extends object>(
  store: Store<T>,
  version: Ref<number>
) =>
  new Proxy({} as T, {
    get(_, key) {
      void version.value;
      const state = store.getState() as Record<PropertyKey, unknown>;
      return state[key];
    },
    has(_, key) {
      void version.value;
      return key in store.getState();
    },
    ownKeys() {
      void version.value;
      return Reflect.ownKeys(store.getState());
    },
    getOwnPropertyDescriptor(_, key) {
      void version.value;
      const descriptor = Object.getOwnPropertyDescriptor(store.getState(), key);
      if (!descriptor) {
        return undefined;
      }
      return {
        ...descriptor,
        configurable: true
      };
    },
    set(_, key, value) {
      const state = store.getState() as Record<PropertyKey, unknown>;
      state[key] = value;
      return true;
    },
    deleteProperty(_, key) {
      const state = store.getState() as Record<PropertyKey, unknown>;
      if (!(key in state)) {
        throw new TypeError(
          `Unknown state key '${String(key)}' cannot be deleted.`
        );
      }
      delete state[key];
      return true;
    },
    defineProperty() {
      throw new Error(directMutationErrorMessage);
    },
    setPrototypeOf() {
      throw new Error(directMutationErrorMessage);
    }
  });

const createAutoSelector = <T extends object>(
  store: Store<T>,
  version: Ref<number>
) => {
  const getPathValue = (path: PropertyKey[]) => {
    let current: unknown = store.getState();
    for (const key of path) {
      if (
        (typeof current !== 'object' && typeof current !== 'function') ||
        current === null
      ) {
        return undefined;
      }
      current = (current as Record<PropertyKey, unknown>)[key];
    }
    return current;
  };
  const createAction = (path: PropertyKey[]) =>
    ((...args: unknown[]) => {
      const fn = getPathValue(path);
      if (typeof fn !== 'function') {
        return undefined;
      }
      const receiverPath = path.slice(0, -1);
      const receiver = receiverPath.length
        ? getPathValue(receiverPath)
        : store.getState();
      return fn.apply(receiver, args);
    }) as (...args: unknown[]) => unknown;
  const createNode = (
    path: PropertyKey[],
    value: unknown,
    ancestors: object[] = []
  ): any => {
    if (typeof value === 'function') {
      return createAction(path);
    }
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      !isPlainObject(value)
    ) {
      return computed(() => {
        void version.value;
        return getPathValue(path);
      });
    }
    if (ancestors.includes(value)) {
      return computed(() => {
        void version.value;
        return getPathValue(path);
      });
    }
    const node = {} as Record<PropertyKey, any>;
    const nextAncestors = [...ancestors, value];
    for (const key of getOwnEnumerableKeys(value)) {
      node[key] = createNode(
        [...path, key],
        (value as Record<PropertyKey, unknown>)[key],
        nextAncestors
      );
    }
    return node;
  };
  const state = store.getState() as Record<PropertyKey, any>;
  const autoSelector = {} as Record<PropertyKey, any>;
  if (!store.isSliceStore) {
    for (const key of getOwnEnumerableKeys(state)) {
      autoSelector[key] = createNode(
        [key],
        (state as Record<PropertyKey, unknown>)[key]
      );
    }
    return autoSelector;
  }
  for (const sliceKey of getOwnEnumerableKeys(state)) {
    const slice = state[sliceKey];
    if (typeof slice !== 'object' || slice === null) {
      continue;
    }
    autoSelector[sliceKey] = createNode([sliceKey], slice);
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
  let destroyed = false;
  store.destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unsubscribe();
    baseDestroy();
  };
  const stateProxy = createStateProxy(store, version);
  let autoSelector: Record<PropertyKey, any> | undefined;
  const useStore = wrapStore(store, (selector: any) => {
    if (typeof selector === 'function') {
      return computed(() => {
        void version.value;
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
