import { create as createVanilla } from 'coaction/shared';
import { createReactStore, type Creator } from './runtime';

export * from './runtime';
export * from 'coaction/shared';

/** Explicit shared/worker-capable React store creator. */
export const create: Creator = ((createState: any, options?: any) =>
  createReactStore(createVanilla as any, createState, options)) as Creator;
