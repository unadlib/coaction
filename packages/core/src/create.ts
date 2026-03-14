import { apply as applyWithMutative } from 'mutative';
import type {
  Listener,
  Slice,
  Store,
  MiddlewareStore,
  StoreOptions,
  CreateState,
  ClientStoreOptions,
  Creator
} from './interface';
import { defaultName, WorkerType } from './constant';
import { createAsyncClientStore } from './asyncClientStore';
import { getInitialState } from './getInitialState';
import { getRawState } from './getRawState';
import { handleState } from './handleState';
import type { Internal } from './internal';
import { applyMiddlewares } from './applyMiddlewares';
import { wrapStore } from './wrapStore';
import { handleMainTransport } from './handleMainTransport';

const namespaceMap = new Map<string, boolean>();
let hasWarnedAmbiguousFunctionMap = false;

const warnAmbiguousFunctionMap = () => {
  if (
    hasWarnedAmbiguousFunctionMap ||
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'test'
  ) {
    return;
  }
  hasWarnedAmbiguousFunctionMap = true;
  console.warn(
    [
      `sliceMode: 'auto' inferred slices from an object of functions.`,
      `This shape is ambiguous with a single store that only contains methods.`,
      `Use create({ ping() {} }, { sliceMode: 'single' }) for a plain method store,`,
      `or create({ counter: (set) => ({ count: 0 }) }, { sliceMode: 'slices' }) for slices.`
    ].join(' ')
  );
};

/**
 * Create a local store, the main side of a shared store, or a client mirror of
 * a shared store.
 *
 * @remarks
 * - Pass a {@link Slice} function for a single store.
 * - Pass an object of slice factories for a slices store.
 * - When an object input only contains functions, prefer explicit `sliceMode`
 *   to avoid ambiguous inference.
 * - When `clientTransport` or `worker` is provided, returned store methods
 *   become promise-returning methods because execution happens on the main
 *   shared store.
 *
 * @see {@link Creator}
 */
export const create: Creator = <T extends CreateState>(
  createState: Slice<T> | T,
  options: StoreOptions<T> | ClientStoreOptions<T> = {}
) => {
  const checkEnablePatches =
    Object.hasOwnProperty.call(options, 'enablePatches') &&
    !(options as StoreOptions<T>).enablePatches;
  const workerType = options.workerType ?? WorkerType;
  if (
    process.env.NODE_ENV === 'development' &&
    (options as StoreOptions<T>).transport &&
    (options as ClientStoreOptions<T>).clientTransport
  ) {
    throw new Error(
      `transport and clientTransport cannot be used together, please use one of them.`
    );
  }
  const storeTransport = (options as StoreOptions<T>).transport;
  const share =
    workerType === 'WebWorkerInternal' ||
    workerType === 'SharedWorkerInternal' ||
    storeTransport
      ? 'main'
      : undefined;
  const createStore = ({ share }: { share?: 'client' | 'main' }) => {
    const store = {} as MiddlewareStore<T>;
    const internal = {
      sequence: 0,
      isBatching: false,
      listeners: new Set<Listener>()
    } as Internal<T>;
    const name = options.name ?? defaultName;
    const shouldTrackName = share === 'main' && process.env.NODE_ENV !== 'test';
    const releaseStoreName = () => {
      if (shouldTrackName) {
        namespaceMap.delete(name);
      }
    };
    // check if the store name is unique in main share mode
    if (shouldTrackName) {
      if (namespaceMap.get(name)) {
        throw new Error(`Store name '${name}' is not unique.`);
      }
      namespaceMap.set(name, true);
    }
    try {
      const { setState, getState } = handleState(store, internal, options);
      const subscribe: Store<T>['subscribe'] = (listener) => {
        internal.listeners.add(listener);
        return () => internal.listeners.delete(listener);
      };
      let isDestroyed = false;
      const destroy: Store<T>['destroy'] = () => {
        if (isDestroyed) {
          return;
        }
        isDestroyed = true;
        internal.listeners.clear();
        store.transport?.dispose();
        releaseStoreName();
      };
      const apply: Store<T>['apply'] = (
        state = internal.rootState as T,
        patches
      ) => {
        internal.rootState = patches
          ? (applyWithMutative(state, patches) as T)
          : state;
        if (internal.updateImmutable) {
          internal.updateImmutable(internal.rootState as T);
        } else {
          internal.listeners.forEach((listener) => listener());
        }
      };
      const getPureState: Store<T>['getPureState'] = () =>
        internal.rootState as T;
      const isFunctionMapObject = () => {
        if (typeof createState === 'object' && createState !== null) {
          const values = Object.values(createState);
          return (
            values.length > 0 &&
            values.every((value) => typeof value === 'function')
          );
        }
        return false;
      };
      const getIsSliceStore = () => {
        const sliceMode = options.sliceMode ?? 'auto';
        if (sliceMode === 'single') {
          return false;
        }
        if (sliceMode === 'slices') {
          if (!isFunctionMapObject()) {
            throw new Error(
              `sliceMode: 'slices' requires createState to be an object of slice functions.`
            );
          }
          return true;
        }
        if (isFunctionMapObject()) {
          warnAmbiguousFunctionMap();
          return true;
        }
        return false;
      };
      const isSliceStore = getIsSliceStore();
      Object.assign(store, {
        name,
        share: share ?? false,
        setState,
        getState,
        subscribe,
        destroy,
        apply,
        isSliceStore,
        getPureState
      } as Store<T>);
      const middlewareStore = applyMiddlewares(
        store,
        options.middlewares ?? []
      );
      if (middlewareStore !== store) {
        Object.assign(store, middlewareStore);
      }
      const initialState = getInitialState(store, createState, internal) as T;
      store.getInitialState = () => initialState;
      internal.rootState = getRawState(
        store,
        internal,
        initialState,
        options
      ) as T;
      return { store, internal };
    } catch (error) {
      releaseStoreName();
      throw error;
    }
  };
  if (
    (options as ClientStoreOptions<T>).clientTransport ||
    (options as ClientStoreOptions<T>).worker ||
    options.workerType === 'WebWorkerClient' ||
    options.workerType === 'SharedWorkerClient'
  ) {
    if (checkEnablePatches) {
      throw new Error(`enablePatches: true is required for the async store`);
    }
    const store = createAsyncClientStore(
      createStore,
      options as ClientStoreOptions<T>
    );
    return wrapStore(store);
  }
  const { store, internal } = createStore({
    share
  });
  handleMainTransport(
    store,
    internal,
    storeTransport,
    workerType,
    checkEnablePatches
  );
  return wrapStore(store);
};
