import { create as createVanilla } from 'coaction';
import { createReactStore, type LocalCreator } from './runtime';

export * from './runtime';
export * from 'coaction';
export type { CreateState, LocalCreator, StoreReturn } from './runtime';

/**
 * Explicit name for what `@coaction/react` already is.
 *
 * @remarks
 * Kept so code written against `@coaction/react/local` keeps working, and for
 * places where naming the local runtime reads better than relying on the
 * default. Re-exporting `./index` instead would duplicate its module graph in
 * this entry's bundle, so the few lines are repeated rather than forwarded.
 */
export const create: LocalCreator = ((createState: any, options?: any) =>
  createReactStore(createVanilla as any, createState, options)) as LocalCreator;
