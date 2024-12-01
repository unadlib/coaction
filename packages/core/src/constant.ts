import { global } from './global';

export const WorkerType = global.SharedWorkerGlobalScope
  ? 'SharedWorkerInternal'
  : globalThis.WorkerGlobalScope
    ? 'WorkerInternal'
    : null;

export const bindSymbol = Symbol('bind');

export const defaultName = 'default';
