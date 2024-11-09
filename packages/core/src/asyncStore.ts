import { createTransport, Transport } from 'data-transport';
import type {
  ExternalEvents,
  InternalEvents,
  Store,
  WorkerOptions,
  TransportOptions,
  AsyncStoreOption
} from './interface';

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
  let _sequence: number;
  const fullSync = async () => {
    console.log('fullSync');
    const latest = await transport.emit('fullSync');
    console.log('fullSync', latest);
    asyncStore.apply(JSON.parse(latest.state));
    _sequence = latest.sequence;
  };
  // TODO: implement to handle the case for the custom transport connects
  if (typeof transport.onConnect !== 'function') {
    throw new Error('transport.onConnect is required');
  }
  transport.onConnect?.(async () => {
    console.log('onConnect');
    await fullSync();
  });
  transport.listen('update', async ({ patches, sequence }) => {
    console.log('update', { patches, sequence });
    if (typeof sequence === 'number' && sequence === _sequence + 1) {
      _sequence = sequence;
      // asyncStore.getState()
      asyncStore.apply(undefined, patches);
    } else {
      await fullSync();
    }
  });
  return Object.assign(() => asyncStore.getState(), asyncStore);
};
