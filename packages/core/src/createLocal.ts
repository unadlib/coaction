import type {
  CreateState,
  LocalCreator,
  LocalStoreOptions,
  Slice
} from './interface';
import { markStoreReady } from './lifecycle';
import { createStore } from './storeFactory';
import { wrapStore } from './wrapStore';

/**
 * Create a store without linking the shared transport runtime.
 *
 * @remarks
 * The default `coaction` entry exports this implementation as `create`.
 * `createLocal` is only its internal and documentation name; it is not
 * exported by the root `coaction` entry.
 */
export const createLocal: LocalCreator = <T extends CreateState>(
  createState: Slice<T> | T,
  options: LocalStoreOptions<T> = {}
) => {
  for (const key of [
    'clientTransport',
    'executeSyncTimeoutMs',
    'transport',
    'transportPolicy',
    'worker',
    'workerType'
  ]) {
    // Only a value actually worth honouring is rejected. `worker: undefined`
    // is how a caller says "no worker here" -- feature detection, SSR, a
    // progressive-enhancement guard -- and degrading to a local store is
    // exactly right for it. A real worker still points at the shared entry.
    if ((options as Record<string, unknown>)[key] != null) {
      throw new Error(
        `Option '${key}' requires the shared entry point: import from ` +
          `'coaction/shared', or '@coaction/react/shared' in React.`
      );
    }
  }
  const { store, internal } = createStore(createState, options);
  try {
    markStoreReady(store);
    internal.assertAlive?.('store initialization');
  } catch (error) {
    try {
      store.destroy();
    } catch (destroyError) {
      if (process.env.NODE_ENV === 'development') {
        console.error(destroyError);
      }
    }
    throw error;
  }
  return wrapStore(store);
};
