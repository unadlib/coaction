export { create } from './create';
export { createBinder, defineExternalStoreAdapter } from './binder';
export { wrapStore } from './wrapStore';
export {
  computed,
  effect,
  effectScope,
  signal,
  trigger,
  isComputed,
  isEffect,
  isEffectScope,
  isSignal,
  startBatch,
  endBatch
} from 'alien-signals';

export type {
  Store,
  MiddlewareStore,
  StoreOptions,
  ISlices,
  Slice,
  Slices,
  Middleware,
  PatchTransform,
  StoreTraceEvent,
  ClientStoreOptions,
  SliceState,
  Asyncify,
  StoreWithAsyncFunction as AsyncStore
} from './interface';

export type { ExternalStoreAdapterOptions } from './binder';
