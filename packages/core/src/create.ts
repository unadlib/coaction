import { type Draft, apply as applyWithMutative, type Patches } from 'mutative';
import { createTransport } from 'data-transport';
import type {
  ISlices,
  Listener,
  Slice,
  SliceState,
  Store,
  StoreOptions,
  StoreReturn,
  AsyncStoreOption
} from './interface';
import { defaultId, WorkerType } from './constant';
import { createAsyncStore, handleMainTransport } from './asyncStore';
import { getInitialState } from './getInitialState';
import { getRawState } from './getRawState';
import { handleState } from './handleState';
import { Internal } from './internal';

/**
 * Create a store
 *
 * description:
 * - create a store with the given state and options
 * - if options.enablePatches is false, the store will not support patches
 * - if options.workerType is provided, the store will be created in a worker
 * - if options.transport is provided, the store will use the transport
 * - if options.id is provided, the store will use the id
 * - if options.share is provided, the store will use the share
 * - if options.share is 'main', the store will be created in the main thread
 * - if options.share is 'client', the store will be created in the client thread
 * - if options.share is not provided, the store will be created in the main thread
 * - if options.share is not provided and options.workerType is provided, the store will be created in the worker
 * - if options.share is not provided and options.transport is provided, the store will use the transport
 * - if options.share is not provided and options.workerType is not provided, the store will be created in the main thread
 */
export const create: {
  <T extends Record<string, Slice<any>>>(
    createState: T,
    options?: StoreOptions
  ): StoreReturn<SliceState<T>, true>;
  <T extends ISlices>(
    createState: Slice<T>,
    options?: StoreOptions
  ): StoreReturn<T>;
} = <T extends ISlices | Record<string, Slice<any>>>(
  createState: any,
  options: StoreOptions = {}
) => {
  const checkEnablePatches =
    Object.hasOwnProperty.call(options, 'enablePatches') &&
    !options.enablePatches;
  const workerType = (options.workerType ?? WorkerType) as typeof WorkerType;
  const share = workerType || options.transport ? 'main' : undefined;
  const createStore = ({ share }: { share?: 'client' | 'main' }) => {
    const store = {} as Store<T>;
    const internal = {
      sequence: 0,
      isBatching: false,
      listeners: new Set<Listener>()
    } as Internal<T>;
    // TODO: check id/name is unique
    const name = options.id ?? defaultId;
    const { setState, getState } = handleState(store, internal, options);
    const subscribe: Store<T>['subscribe'] = (listener) => {
      internal.listeners.add(listener);
      return () => internal.listeners.delete(listener);
    };
    const destroy = () => {
      internal.listeners.clear();
      store.transport?.dispose();
    };
    const apply: Store<T>['apply'] = (state = internal.rootState, patches) => {
      // console.log('apply', { state, patches });
      internal.rootState = patches
        ? (applyWithMutative(state, patches) as T)
        : state;
      internal.listeners.forEach((listener) => listener());
    };
    const isSliceStore = typeof createState === 'object';
    Object.assign(store, {
      id: name,
      share,
      setState,
      getState,
      subscribe,
      destroy,
      apply,
      isSliceStore
    });
    const initialState = getInitialState(store, createState);
    internal.rootState = getRawState(store, internal, initialState, options);
    // in worker, the transport is the worker itself
    const transport =
      options.transport ??
      (workerType
        ? createTransport(workerType, {
            prefix: store.id
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
  return Object.assign((asyncStoreOption: AsyncStoreOption) => {
    if (!asyncStoreOption) return store.getState();
    if (checkEnablePatches) {
      throw new Error(`enablePatches: true is required for the async store`);
    }
    return createAsyncStore(createStore, asyncStoreOption);
  }, store) as StoreReturn<any>;
};
