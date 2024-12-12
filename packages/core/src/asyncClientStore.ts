import { createTransport, type Transport } from 'data-transport';
import type { Patches } from 'mutative';
import type {
  ExternalEvents,
  InternalEvents,
  Store,
  ClientTransportOptions,
  CreateState,
  ClientTransport
} from './interface';
import type { Internal } from './internal';

export const createAsyncClientStore = <T extends CreateState>(
  createStore: (options: { share?: 'client' }) => Store<T>,
  asyncStoreClientOption: ClientTransportOptions
) => {
  const asyncClientStore = createStore({
    share: 'client'
  });
  // the transport is in the worker or shared worker, and the client is in the main thread.
  // This store can't be directly executed by any of the store's methods
  // its methods are proxied to the worker or share worker for execution.
  // and the executed patch is sent to the store to be applied to synchronize the state.
  const transport: ClientTransport = asyncStoreClientOption.worker
    ? createTransport(
        asyncStoreClientOption.worker instanceof SharedWorker
          ? 'SharedWorkerClient'
          : 'WebWorkerClient',
        {
          worker: asyncStoreClientOption.worker as SharedWorker,
          prefix: asyncClientStore.name
        }
      )
    : asyncStoreClientOption.clientTransport;
  if (!transport) {
    throw new Error('transport is required');
  }
  asyncClientStore.transport = transport;
  let sequence: number;
  const fullSync = async () => {
    const latest = await transport.emit('fullSync');
    asyncClientStore.apply(JSON.parse(latest.state));
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
      asyncClientStore.apply(undefined, options.patches);
    } else {
      await fullSync();
    }
  });
  const { name, ..._store } = asyncClientStore;
  return Object.assign(
    {
      [name]: () => asyncClientStore.getState()
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