import { create as createVanilla } from 'coaction/local';
import { createReactStore, type LocalCreator } from './runtime';

export * from './runtime';
export * from 'coaction/local';
// Both star exports carry these names. The React flavours are the ones this
// entry's `create` is typed with, so re-export them explicitly to win.
export type { CreateState, LocalCreator, StoreReturn } from './runtime';

/**
 * Create a React store.
 *
 * This entry links the local runtime only. Worker and cross-context stores
 * need `@coaction/react/shared`, which carries the transport protocol; passing
 * a `worker` or `transport` option here is rejected rather than silently
 * pulling that runtime into every bundle that imports React state.
 */
export const create: LocalCreator = ((createState: any, options?: any) =>
  createReactStore(createVanilla as any, createState, options)) as LocalCreator;
