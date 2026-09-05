import { createTransport } from 'data-transport';
import type { Patches } from './patch';
import type {
  ClientTransport,
  ClientTransportOptions,
  CreateState,
  MiddlewareStore
} from './interface';
import type { Internal } from './internal';
import {
  failStoreSetup,
  failTransportInitialization,
  markStoreReady,
  reportLifecycleError
} from './lifecycle';
import {
  decodeFullSyncResponse,
  decodeUpdateMessage,
  encodeFullSyncRequest,
  encodeUpdateMessage,
  type UpdateMessage
} from './transportProtocol';
import { wrapStore } from './wrapStore';

const clientApplyErrorMessage =
  'apply() cannot be called in the client store. Client stores are mirrors; use a store method to update the main store instead.';

export const createAsyncClientStore = <T extends CreateState>(
  createStore: (options: { share?: 'client' }) => {
    store: MiddlewareStore<T>;
    internal: Internal<T>;
  },
  options: ClientTransportOptions
) => {
  let createdStore: ReturnType<typeof createStore>;
  try {
    createdStore = createStore({ share: 'client' });
  } catch (error) {
    return failTransportInitialization(options.clientTransport, error);
  }
  const { store, internal } = createdStore;
  let canApplyClientState = false;
  const previousAssertMutationAllowed = internal.assertMutationAllowed;
  internal.assertMutationAllowed = (operation) => {
    if (operation === 'apply') {
      if (!canApplyClientState) {
        throw new Error(clientApplyErrorMessage);
      }
      canApplyClientState = false;
    }
    previousAssertMutationAllowed?.(operation);
  };
  const baseApply = store.apply.bind(store);
  store.apply = () => {
    throw new Error(clientApplyErrorMessage);
  };
  internal.applyClientState = (...args) => {
    canApplyClientState = true;
    try {
      baseApply(...args);
    } finally {
      canApplyClientState = false;
    }
  };

  const isSharedWorker =
    typeof SharedWorker !== 'undefined' &&
    options.worker instanceof SharedWorker;
  let transport: ClientTransport;
  try {
    transport = options.worker
      ? createTransport(
          isSharedWorker ? 'SharedWorkerClient' : 'WebWorkerClient',
          {
            worker: options.worker as SharedWorker,
            prefix: store.name
          }
        )
      : options.clientTransport;
  } catch (error) {
    return failStoreSetup(store, error);
  }
  if (!transport) {
    return failStoreSetup(store, new Error('transport is required'));
  }
  try {
    store.transport = transport;
    if (typeof transport.onConnect !== 'function') {
      throw new Error('transport.onConnect is required');
    }
  } catch (error) {
    return failStoreSetup(store, error);
  }

  const destroyedMarker = Symbol('destroyed client transport');
  let resolveDestroyed!: () => void;
  const destroyedSignal = new Promise<typeof destroyedMarker>((resolve) => {
    resolveDestroyed = () => resolve(destroyedMarker);
  });
  const disposers = new Set<() => void>();
  let destroyed = false;
  let connectGeneration = 0;
  let connectSync: Promise<void> | null = null;
  let syncTail: Promise<void> = Promise.resolve();

  const registerDisposer = (value: unknown) => {
    if (typeof value === 'function') {
      disposers.add(value as () => void);
    }
  };
  const cleanup = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    connectGeneration += 1;
    resolveDestroyed();
    const callbacks = [...disposers];
    disposers.clear();
    for (const dispose of callbacks) {
      try {
        dispose();
      } catch (error) {
        reportLifecycleError(error);
      }
    }
  };
  const awaitActive = async <R>(value: PromiseLike<R> | R) => {
    const result = await Promise.race([
      Promise.resolve(value),
      destroyedSignal
    ]);
    if (result === destroyedMarker) {
      throw new Error('Client transport was destroyed');
    }
    return result as R;
  };
  internal.awaitClientTransport = awaitActive;

  const applyFullSync = (state: object, epoch: string, sequence: number) => {
    const previousEpoch = internal.transportEpoch;
    const previousSequence = internal.sequence;
    internal.transportEpoch = epoch;
    internal.sequence = sequence;
    try {
      internal.applyClientState!(state as T);
    } catch (error) {
      internal.transportEpoch = previousEpoch;
      internal.sequence = previousSequence;
      throw error;
    }
  };

  const fullSync = (
    expectedEpoch?: string,
    minimumSequence = 0,
    generation = connectGeneration
  ) => {
    const execute = async () => {
      if (destroyed || generation !== connectGeneration) {
        return;
      }
      const encoded = await awaitActive(
        transport.emit('fullSync', encodeFullSyncRequest())
      );
      if (destroyed || generation !== connectGeneration) {
        return;
      }
      const snapshot = decodeFullSyncResponse(encoded);
      if (expectedEpoch && snapshot.epoch !== expectedEpoch) {
        throw new Error('Mismatched fullSync epoch');
      }
      if (snapshot.sequence < minimumSequence) {
        throw new Error('Stale fullSync sequence');
      }
      if (
        snapshot.epoch === internal.transportEpoch &&
        snapshot.sequence < internal.sequence
      ) {
        return;
      }
      applyFullSync(snapshot.state, snapshot.epoch, snapshot.sequence);
    };
    const run = syncTail.then(execute, execute);
    syncTail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
  internal.syncClientState = (expectedEpoch, minimumSequence) =>
    fullSync(expectedEpoch, minimumSequence);

  const applyUpdate = (update: UpdateMessage) => {
    const previousEpoch = internal.transportEpoch;
    const previousSequence = internal.sequence;
    internal.transportEpoch = update.epoch;
    internal.sequence = update.sequence;
    try {
      internal.applyClientState!(undefined, update.patches as Patches);
    } catch (error) {
      internal.transportEpoch = previousEpoch;
      internal.sequence = previousSequence;
      throw error;
    }
  };

  const handleUpdate = async (encoded: string) => {
    if (destroyed) {
      return;
    }
    const generation = connectGeneration;
    const update = decodeUpdateMessage(encoded);
    if (connectSync) {
      await connectSync;
    }
    if (destroyed || generation !== connectGeneration) {
      return;
    }

    if (update.epoch !== internal.transportEpoch) {
      await fullSync(update.epoch, 0, generation);
    }
    if (destroyed || generation !== connectGeneration) {
      return;
    }
    if (update.epoch !== internal.transportEpoch) {
      throw new Error('Mismatched update epoch');
    }
    if (update.sequence <= internal.sequence) {
      return;
    }
    if (update.sequence === internal.sequence + 1) {
      applyUpdate(update);
      return;
    }
    await fullSync(update.epoch, update.sequence, generation);
  };

  internal.destroyCallbacks?.add(cleanup);
  try {
    registerDisposer(
      transport.listen('update', async (encoded) => {
        try {
          await handleUpdate(encoded);
        } catch (error) {
          if (!destroyed) {
            try {
              await fullSync();
            } catch (syncError) {
              reportLifecycleError(syncError);
            }
            reportLifecycleError(error);
          }
        }
      })
    );
    registerDisposer(
      transport.onConnect(() => {
        const generation = ++connectGeneration;
        const pending = fullSync(undefined, 0, generation).finally(() => {
          if (connectSync === pending) {
            connectSync = null;
          }
        });
        connectSync = pending;
        void pending.catch(reportLifecycleError);
        return pending;
      })
    );
    markStoreReady(store);
    internal.assertAlive?.('store initialization');
  } catch (error) {
    return failStoreSetup(store, error);
  }

  return wrapStore(store, () => store.getState());
};

export const emit = <T extends CreateState>(
  store: MiddlewareStore<T>,
  internal: Internal<T>,
  patches?: Patches
) => {
  if (!store.transport || !patches?.length || !internal.transportEpoch) {
    return;
  }
  const sequence = internal.sequence + 1;
  const encoded = encodeUpdateMessage(
    internal.transportEpoch,
    sequence,
    patches
  );
  internal.sequence = sequence;
  try {
    const pending = store.transport.emit(
      { name: 'update', respond: false },
      encoded
    );
    void Promise.resolve(pending).catch(reportLifecycleError);
  } catch (error) {
    reportLifecycleError(error);
  }
};
