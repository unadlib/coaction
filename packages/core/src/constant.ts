import { global } from './global';

export const WorkerType = global.SharedWorkerGlobalScope
  ? 'SharedWorkerInternal'
  : globalThis.WorkerGlobalScope
    ? 'WebWorkerInternal'
    : null;

export const bindSymbol = Symbol('bind');

export const defaultName = 'default';
