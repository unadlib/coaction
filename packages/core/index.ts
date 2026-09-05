/**
 * The default entry: a store that lives in one JavaScript context.
 *
 * No transport is reachable from here, so `data-transport` stays out of the
 * bundle -- 27 KB minified that a single-context application would otherwise
 * carry for a mode it never uses. Reach for `coaction/shared` when a store has
 * to be shared across a Worker, an iframe, an Electron process or an extension.
 */
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
  Asyncify,
  StoreWithAsyncFunction as AsyncStore,
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
  StoreOptions,
  StoreReturn,
  StoreTraceEvent
} from './src/interface';
export type { JsonPrimitive, JsonValue } from './src/jsonTypes';
export type { Patch, PatchOperation, Patches } from './src/patch';
