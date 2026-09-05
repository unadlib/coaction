export { createLocal as create } from './src/createLocal';
export { onStoreReady } from './src/lifecycle';
export { whole } from './src/getRawStateStateProperty';
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

export type {
  CreateState,
  DeepPartial,
  Getter,
  ISlices,
  Listener,
  LocalCreator,
  LocalStoreOptions,
  Middleware,
  MiddlewareStore,
  PatchTransform,
  Slice,
  Slices,
  SliceState,
  Store,
  StoreReturn,
  StoreTraceEvent
} from './src/interface';
