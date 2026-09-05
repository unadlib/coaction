export { createLocal as create } from './src/createLocal';
export { onStoreReady } from './src/lifecycle';
export { whole } from './src/getRawStateStateProperty';
export { wrapStore } from './src/wrapStore';
// Patch and schema handling is how a store validates and replays its own
// state; none of it is transport-specific, and all of it is already in this
// entry's graph because the local runtime uses it.
export {
  applyPatches,
  assertSafePatches,
  isStateSchemaError,
  sanitizeInitialStateValue,
  sanitizePatches,
  sanitizeReplacementState,
  StateSchemaError,
  UnsafePatchPathError
} from './src/utils';
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
