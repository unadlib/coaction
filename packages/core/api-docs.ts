export { create } from './src/create';
export { createBinder, defineExternalStoreAdapter } from './src/binder';
export { wrapStore } from './src/wrapStore';
export {
  computed,
  effect,
  effectScope,
  endBatch,
  isComputed,
  isEffect,
  isEffectScope,
  isSignal,
  signal,
  startBatch,
  trigger
} from 'alien-signals';

export type { ExternalStoreAdapterOptions } from './src/binder';

export type {
  Asyncify,
  ClientStoreOptions,
  ISlices,
  Middleware,
  MiddlewareStore,
  PatchTransform,
  Slice,
  SliceState,
  Slices,
  Store,
  StoreOptions,
  StoreTraceEvent,
  StoreWithAsyncFunction as AsyncStore
} from './src/interface';
