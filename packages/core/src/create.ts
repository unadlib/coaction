import { apply as applyWithMutative } from 'mutative';
import { createTransport } from 'data-transport';
import type {
  ISlices,
  Listener,
  Slice,
  SliceState,
  Store,
  StoreOptions,
  StoreReturn,
  AsyncStoreOption,
  CreateState
} from './interface';
import { defaultName, WorkerType } from './constant';
import { createAsyncStore, handleMainTransport } from './asyncStore';
import { getInitialState } from './getInitialState';
import { getRawState } from './getRawState';
import { handleState } from './handleState';
import type { Internal } from './internal';
import { applyMiddlewares } from './applyMiddlewares';

const namespaceMap = new Map<string, boolean>();

type Creator = {
  <T extends Record<string, Slice<any>>>(
    createState: T,
    options?: StoreOptions<T>
  ): StoreReturn<SliceState<T>, true>;
  <T extends ISlices>(
    createState: Slice<T>,
    options?: StoreOptions<T>
  ): StoreReturn<T>;
};

/**
 * Create a store
 */
export const create: Creator = <T extends CreateState>(
  createState: Slice<T> | T,
  options: StoreOptions<T> = {}
) => {
  const checkEnablePatches =
    Object.hasOwnProperty.call(options, 'enablePatches') &&
    !options.enablePatches;
  const workerType = options.workerType ?? WorkerType;
  const share = workerType || options.transport ? 'main' : undefined;
  const createStore = ({ share }: { share?: 'client' | 'main' }) => {
    const store = {} as Store<T>;
    const internal = {
      sequence: 0,
      isBatching: false,
      listeners: new Set<Listener>()
    } as Internal<T>;
    const name = options.name ?? defaultName;
    // check if the store name is unique in main share mode
    if (process.env.NODE_ENV === 'development' && share === 'main') {
      if (namespaceMap.get(name)) {
        throw new Error(`Store name '${name}' is not unique.`);
      }
      namespaceMap.set(name, true);
    }
    const { setState, getState } = handleState(store, internal, options);
    const subscribe: Store<T>['subscribe'] = (listener) => {
      internal.listeners.add(listener);
      return () => internal.listeners.delete(listener);
    };
    const destroy: Store<T>['destroy'] = () => {
      internal.listeners.clear();
      store.transport?.dispose();
    };
    const apply: Store<T>['apply'] = (
      state = internal.rootState as T,
      patches
    ) => {
      internal.rootState = patches
        ? (applyWithMutative(state, patches) as T)
        : state;
      internal.listeners.forEach((listener) => listener());
    };
    const getPureState: Store<T>['getPureState'] = () =>
      internal.rootState as T;
    const isSliceStore = typeof createState === 'object';
    Object.assign(store, {
      name,
      share,
      setState,
      getState,
      subscribe,
      destroy,
      apply,
      isSliceStore,
      getPureState
    } as Store<T>);
    applyMiddlewares(store, options.middlewares ?? []);
    const initialState = getInitialState(store, createState);
    internal.rootState = getRawState(
      store,
      internal,
      initialState,
      options
    ) as T;
    // in worker, the transport is the worker itself
    const transport =
      options.transport ??
      (workerType
        ? createTransport(workerType, {
            prefix: store.name
          })
        : null);
    if (transport) {
      if (checkEnablePatches) {
        throw new Error(`enablePatches: true is required for the transport`);
      }
      handleMainTransport(store, transport, internal);
    }
    return store;
  };
  const store = createStore({
    share
  });
  const { name, ..._store } = store;
  return Object.assign(
    {
      [name]: (asyncStoreOption: AsyncStoreOption) => {
        if (!asyncStoreOption) return store.getState();
        if (checkEnablePatches) {
          throw new Error(
            `enablePatches: true is required for the async store`
          );
        }
        return createAsyncStore(createStore, asyncStoreOption);
      }
    }[name],
    _store
  ) as StoreReturn<any>;
};
