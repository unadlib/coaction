import { apply as applyWithMutative } from 'mutative';
import type {
  Listener,
  Slice,
  Store,
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

/**
 * Create a simple store or a shared store. The shared store can be used in a worker or another thread.
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
    const store = {} as Store<T>;
    const internal = {
      sequence: 0,
      isBatching: false,
      listeners: new Set<Listener>()
    } as Internal<T>;
    const name = options.name ?? defaultName;
    const shouldTrackName =
      process.env.NODE_ENV === 'development' && share === 'main';
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
      const destroy: Store<T>['destroy'] = () => {
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
      let isSliceStore = false;
      if (typeof createState === 'object' && createState !== null) {
        const values = Object.values(createState);
        if (
          values.length > 0 &&
          values.every((value) => typeof value === 'function')
        ) {
          isSliceStore = true;
        }
        // If values.length is 0 (empty object), or not all values are functions,
        // and createState is an object, isSliceStore remains false.
        // This means it's treated as a plain object state or an empty object.
      }
      // If createState is a function (not an object), isSliceStore also remains false.
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
      const initialState = getInitialState(store, createState, internal);
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
