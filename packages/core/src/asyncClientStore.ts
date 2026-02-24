import { createTransport } from 'data-transport';
import type { Patches } from 'mutative';
import type {
  Store,
  ClientTransportOptions,
  CreateState,
  ClientTransport
} from './interface';
import type { Internal } from './internal';
import { wrapStore } from './wrapStore';

export const createAsyncClientStore = <T extends CreateState>(
  createStore: (options: { share?: 'client' }) => {
    store: Store<T>;
    internal: Internal<T>;
  },
  asyncStoreClientOption: ClientTransportOptions
) => {
  const { store: asyncClientStore, internal } = createStore({
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
  let syncingPromise: Promise<void> | null = null;
  const fullSync = async () => {
    if (!syncingPromise) {
      syncingPromise = (async () => {
        const latest = await transport.emit('fullSync');
        asyncClientStore.apply(JSON.parse(latest.state));
        internal.sequence = latest.sequence;
      })().finally(() => {
        syncingPromise = null;
      });
    }
    return syncingPromise;
  };
  if (typeof transport.onConnect !== 'function') {
    throw new Error('transport.onConnect is required');
  }
  transport.onConnect?.(() => {
    void fullSync().catch((error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error(error);
      }
    });
  });
  transport.listen('update', async (options) => {
    try {
      if (typeof options.sequence !== 'number') {
        await fullSync();
        return;
      }
      if (options.sequence <= internal.sequence) {
        return;
      }
      if (options.sequence === internal.sequence + 1) {
        internal.sequence = options.sequence;
        asyncClientStore.apply(undefined, options.patches);
      } else {
        await fullSync();
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(error);
      }
    }
  });
  return wrapStore(asyncClientStore, () => asyncClientStore.getState());
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
