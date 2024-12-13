import { apply as applyWithMutative } from 'mutative';
import { createTransport, Transport } from 'data-transport';
import type {
  Listener,
  Slice,
  Store,
  StoreOptions,
  CreateState,
  ClientStoreOptions,
  Creator,
  StoreTransport
} from './interface';
import { defaultName, WorkerType } from './constant';
import {
  createAsyncClientStore,
  handleMainTransport
} from './asyncClientStore';
import { getInitialState } from './getInitialState';
import { getRawState } from './getRawState';
import { handleState } from './handleState';
import type { Internal } from './internal';
import { applyMiddlewares } from './applyMiddlewares';
import { wrapStore } from './wrapStore';

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
  const createStore = ({
    share,
    transport
  }: {
    share?: 'client' | 'main';
    transport?: Transport;
  }) => {
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
      share: share ?? false,
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
    store.getInitialState = () => initialState;
    internal.rootState = getRawState(
      store,
      internal,
      initialState,
      options
    ) as T;
    // store transport for server port
    // the store transport is responsible for transmitting the sync state to the client transport.
    const storeTransport: StoreTransport =
      transport ??
      (workerType === 'SharedWorkerInternal' ||
      workerType === 'WebWorkerInternal'
        ? createTransport(workerType, {
            prefix: store.name
          })
        : undefined);
    if (storeTransport) {
      if (typeof storeTransport.onConnect !== 'function') {
        throw new Error('transport.onConnect is required');
      }
      if (checkEnablePatches) {
        throw new Error(`enablePatches: true is required for the transport`);
      }
      handleMainTransport(store, storeTransport, internal);
    }
    return store;
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
  const store = createStore({
    share,
    transport: storeTransport
  });
  return wrapStore(store);
};
