import { createAuthorityStore } from './todosSlice';

/**
 * The write authority inside the SharedWorker.
 *
 * coaction detects `SharedWorkerGlobalScope` and bridges this store to every
 * connecting tab: actions execute here and the resulting patches are
 * broadcast back to all client mirrors.
 */
createAuthorityStore();
