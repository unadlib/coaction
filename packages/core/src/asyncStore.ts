import { createTransport, type Transport } from 'data-transport';
import type { Patches } from 'mutative';
import type {
  ExternalEvents,
  InternalEvents,
  Store,
  WorkerOptions,
  TransportOptions,
  AsyncStoreOption,
  CreateState
} from './interface';
import type { Internal } from './internal';

export const createAsyncStore = <T extends CreateState>(
  createStore: (options: { share?: 'client' | 'main' }) => Store<T>,
  asyncStoreOption: AsyncStoreOption
) => {
  const asyncStore = createStore({
    share: 'client'
  });
  // the transport is in the worker or shared worker, and the client is in the main thread.
  // This store can't be directly executed by any of the store's methods
  // its methods are proxied to the worker or share worker for execution.
  // and the executed patch is sent to the store to be applied to synchronize the state.
  const transport:
    | (Transport<{ listen: InternalEvents; emit: ExternalEvents }> & {
        /**
         * onConnect is called when the transport is connected.
         */
        onConnect?: (fn: () => void) => void;
      })
    | undefined = (asyncStoreOption as WorkerOptions).worker
    ? createTransport(
        (asyncStoreOption as WorkerOptions).worker instanceof SharedWorker
          ? 'SharedWorkerClient'
          : 'WorkerMain',
        {
          worker: (asyncStoreOption as WorkerOptions).worker as SharedWorker,
          prefix: asyncStore.name
        }
      )
    : (asyncStoreOption as TransportOptions).transport;
  if (!transport) {
    throw new Error('transport is required');
  }
  asyncStore.transport = transport;
  let sequence: number;
  const fullSync = async () => {
    const latest = await transport.emit('fullSync');
    asyncStore.apply(JSON.parse(latest.state));
    sequence = latest.sequence;
  };
  if (typeof transport.onConnect !== 'function') {
    throw new Error('transport.onConnect is required');
  }
  transport.onConnect?.(async () => {
    await fullSync();
  });
  transport.listen('update', async (options) => {
    if (
      typeof options.sequence === 'number' &&
      options.sequence === sequence + 1
    ) {
      sequence = options.sequence;
      asyncStore.apply(undefined, options.patches);
    } else {
      await fullSync();
    }
  });
  const { name, ..._store } = asyncStore;
  return Object.assign(
    {
      [name]: () => asyncStore.getState()
    }[name],
    _store
  );
};

export const handleMainTransport = <T extends CreateState>(
  store: Store<T>,
  transport: Transport<{
    emit: InternalEvents;
    listen: ExternalEvents;
  }>,
  internal: Internal<T>
) => {
  transport.listen('execute', async (keys, args) => {
    let base = store.getState();
    let obj = base;
    for (const key of keys) {
      base = base[key];
      if (typeof base === 'function') {
        base = base.bind(obj);
      }
      obj = base;
    }
    if (process.env.NODE_ENV === 'development' && typeof base !== 'function') {
      throw new Error('The function is not found');
    }
    try {
      return (base as Function)(...args);
    } catch (error: any) {
      console.error(error);
      return { $$Error: error.message };
    }
  });
  transport.listen('fullSync', async () => {
    return {
      state: JSON.stringify(internal.rootState),
      sequence: internal.sequence
    };
  });
  store.transport = transport;
};

export const emit = <T extends CreateState>(
  store: Store<T>,
  internal: Internal<T>,
  patches?: Patches
) => {
  if (store.transport && patches?.length) {
    internal.sequence += 1;
    // it is not necessary to respond to the update event
    store.transport.emit(
      {
        name: 'update',
        respond: false
      },
      {
        patches: patches,
        sequence: internal.sequence
      }
    );
  }
};

export const handleDraft = <T extends CreateState>(
  store: Store<T>,
  internal: Internal<T>
) => {
  internal.rootState = internal.backupState;
  const [, patches, inversePatches] = internal.finalizeDraft();
  const finalPatches = store.patch
    ? store.patch({ patches, inversePatches })
    : { patches, inversePatches };
  if (finalPatches.patches.length) {
    store.apply(internal.rootState as T, finalPatches.patches);
    // 3rd party model will send update notifications on its own after `store.apply` in mutableInstance mode
    emit(store, internal, finalPatches.patches);
  }
};
