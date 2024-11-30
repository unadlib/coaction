import { createTransport, type Transport } from 'data-transport';
import type { Patches } from 'mutative';
import type {
  ExternalEvents,
  InternalEvents,
  Store,
  WorkerOptions,
  TransportOptions,
  AsyncStoreOption
} from './interface';
import type { Internal } from './internal';

export const createAsyncStore = (
  createStore: (options: { share?: 'client' | 'main' }) => Store<any>,
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
          prefix: asyncStore.id
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
  return Object.assign(() => asyncStore.getState(), asyncStore);
};

export const handleMainTransport = (
  store: Store<any>,
  transport: Transport<{
    emit: InternalEvents;
    listen: ExternalEvents;
  }>,
  internal: Internal<any>
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
    return base(...args);
  });
  transport.listen('fullSync', async () => {
    return {
      state: JSON.stringify(internal.rootState),
      sequence: internal.sequence
    };
  });
  store.transport = transport;
};

export const emit = (
  store: Store<any>,
  internal: Internal<any>,
  patches?: Patches
) => {
  if (store.transport && patches?.length) {
    internal.sequence += 1;
    store.transport.emit('update', {
      patches: patches,
      sequence: internal.sequence
    });
  }
};

export const handleDraft = (store: Store<any>, internal: Internal<any>) => {
  internal.rootState = internal.backupState;
  const [, patches, inversePatches] = internal.finalizeDraft();
  const finalPatches = store.patch
    ? store.patch({ patches, inversePatches })
    : { patches, inversePatches };
  if (finalPatches.patches.length) {
    store.apply(internal.rootState, finalPatches.patches);
    // 3rd party model will send update notifications on its own after `store.apply` in mutableInstance mode
    emit(store, internal, finalPatches.patches);
  }
};
