import type {
  ClientStoreOptions,
  CreateState,
  MiddlewareStore,
  StoreOptions
} from './interface';
import type { Internal } from './internal';
import { createClientAction } from './getRawStateClientAction';
import { createLocalAction } from './getRawStateLocalAction';
import { prepareStateDescriptor } from './getRawStateStateProperty';
import { isUnsafeKey, setOwnEnumerable } from './utils';

const defaultClientExecuteSyncTimeoutMs = 1500;

const getClientExecuteSyncTimeoutMs = (
  options: StoreOptions<any> | ClientStoreOptions<any>
) => {
  const timeout = (options as ClientStoreOptions<any>).executeSyncTimeoutMs;
  if (typeof timeout === 'undefined') {
    return defaultClientExecuteSyncTimeoutMs;
  }
  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new Error(
      'executeSyncTimeoutMs must be a finite number greater than or equal to 0'
    );
  }
  return timeout;
};

export const getRawState = <T extends CreateState>(
  store: MiddlewareStore<T>,
  internal: Internal<T>,
  initialState: any,
  options: StoreOptions<T> | ClientStoreOptions<T>
) => {
  const clientExecuteSyncTimeoutMs = getClientExecuteSyncTimeoutMs(options);
  const rawState = {} as Record<string, any>;
  const handle = (_rawState: any, _initialState: any, sliceKey?: string) => {
    internal.mutableInstance = internal.toMutableRaw?.(_initialState);
    const safeDescriptors: PropertyDescriptorMap = {};
    const descriptors = Object.getOwnPropertyDescriptors(_initialState);
    Reflect.ownKeys(descriptors).forEach((key) => {
      if (typeof key === 'string' && isUnsafeKey(key)) {
        return;
      }
      (safeDescriptors as any)[key] = Reflect.get(descriptors, key);
    });
    Reflect.ownKeys(safeDescriptors).forEach((key) => {
      const descriptor = (safeDescriptors as any)[key] as
        | PropertyDescriptor
        | undefined;
      if (typeof descriptor === 'undefined') {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        if (typeof descriptor.value !== 'function') {
          prepareStateDescriptor({
            descriptor,
            internal,
            key,
            rawState: _rawState,
            sliceKey
          });
          return;
        }
        if (typeof key !== 'string') {
          return;
        }
        if (store.share === 'client') {
          descriptor.value = createClientAction({
            clientExecuteSyncTimeoutMs,
            internal,
            key,
            store,
            sliceKey
          });
        } else {
          descriptor.value = createLocalAction({
            fn: descriptor.value,
            internal,
            key,
            options,
            store,
            sliceKey
          });
        }
      }
    });
    // it should be a immutable state
    const slice = Object.defineProperties({}, safeDescriptors);
    return slice;
  };
  if (store.isSliceStore) {
    internal.module = {} as T;
    Object.entries(initialState).forEach(([key, value]) => {
      if (isUnsafeKey(key)) {
        return;
      }
      const sliceRawState = {};
      setOwnEnumerable(rawState, key, sliceRawState);
      setOwnEnumerable(
        internal.module as Record<string, unknown>,
        key,
        handle(sliceRawState, value, key)
      );
    });
  } else {
    internal.module = handle(rawState, initialState) as T;
  }
  return rawState;
};
