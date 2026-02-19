import { createTransport, type Transport } from 'data-transport';
import type {
  ExternalEvents,
  InternalEvents,
  Store,
  CreateState,
  StoreTransport
} from './interface';
import type { Internal } from './internal';

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const handleMainTransport = <T extends CreateState>(
  store: Store<T>,
  internal: Internal<T>,
  storeTransport?: Transport<{
    emit: InternalEvents;
    listen: ExternalEvents;
  }>,
  workerType?:
    | 'SharedWorkerInternal'
    | 'WebWorkerInternal'
    | 'WebWorkerClient'
    | 'SharedWorkerClient'
    | null,
  checkEnablePatches?: boolean
) => {
  // store transport for server port
  // the store transport is responsible for transmitting the sync state to the client transport.
  const transport: StoreTransport | undefined =
    storeTransport ??
    (workerType === 'SharedWorkerInternal' || workerType === 'WebWorkerInternal'
      ? createTransport(workerType, {
          prefix: store.name
        })
      : undefined);
  if (!transport) return;
  if (typeof transport.onConnect !== 'function') {
    throw new Error('transport.onConnect is required');
  }
  if (checkEnablePatches) {
    throw new Error(`enablePatches: true is required for the transport`);
  }
  transport.listen('execute', async (keys, args) => {
    let base = store.getState();
    let obj = base;
    try {
      for (const key of keys) {
        base = base[key];
        if (typeof base === 'function') {
          base = base.bind(obj);
        }
        obj = base;
      }
      if (typeof base !== 'function') {
        throw new Error('The function is not found');
      }
      return [(base as Function)(...args), internal.sequence];
    } catch (error: unknown) {
      if (process.env.NODE_ENV === 'development') {
        console.error(error);
      }
      return [{ $$Error: getErrorMessage(error) }, internal.sequence];
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
