import { type Draft, apply as applyWithMutative, Patches } from 'mutative';
import { createTransport, type Transport } from 'data-transport';
import type {
  ExternalEvents,
  InternalEvents,
  ISlices,
  Listener,
  Slice,
  SliceState,
  Store,
  StoreOptions,
  StoreReturn,
  AsyncStoreOption
} from './interface';
import { defaultId, workerType } from './constant';
import { createAsyncStore, handleMainTransport } from './asyncStore';
import { getInitialState } from './getInitialState';
import { getRawState } from './getRawState';
import { handleState } from './handleState';

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
): any => {
  const _workerType = (options.workerType ?? workerType) as typeof workerType;
  const share = _workerType || options.transport ? 'main' : undefined;
  const createStore = ({ share }: { share?: 'client' | 'main' }) => {
    const store = {} as Store<any>;
    const internal = {
      sequence: 0,
      isBatching: false,
      listeners: new Set<Listener>()
    } as {
      module: T;
      rootState: T | Draft<T>;
      backupState: T | Draft<T>;
      // TODO: fix the type of finalizeDraft
      finalizeDraft: () => [T, Patches, Patches];
      mutableInstance: any;
      sequence: number;
      isBatching: boolean;
      listeners: Set<Listener>;
    };

    // TODO: consider to remove this, about name property should be required.
    const name = options.id ?? defaultId;
    const { setState, getState } = handleState(store, internal, options);
    const subscribe: Store<T>['subscribe'] = (listener) => {
      internal.listeners.add(listener);
      return () => internal.listeners.delete(listener);
    };
    const destroy = () => {
      // TODO: implement more robust destroy method
      internal.listeners.clear();
      store.transport?.dispose();
    };
    const apply: Store<any>['apply'] = (
      state = internal.rootState,
      patches
    ) => {
      // console.log('apply', { state, patches });
      internal.rootState = patches ? applyWithMutative(state, patches) : state;
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
    store;
    const initialState = getInitialState(store, createState);
    internal.rootState = getRawState(store, internal, initialState, options);
    // in worker, the transport is the worker itself
    const transport =
      options.transport ??
      (_workerType
        ? createTransport(_workerType, {
            prefix: store.id
          })
        : null);
    if (transport) {
      if (options.enablePatches === false) {
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
    if (options.enablePatches === false) {
      throw new Error(`enablePatches: true is required for the async store`);
    }
    return createAsyncStore(createStore, asyncStoreOption);
  }, store);
};
