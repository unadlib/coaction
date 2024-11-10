import { global } from './global';

export const workerType = global.SharedWorkerGlobalScope
  ? 'SharedWorkerInternal'
  : globalThis.WorkerGlobalScope
    ? 'WorkerInternal'
    : null;

export const bindSymbol = Symbol('bind');

export const defaultId = 'default';
