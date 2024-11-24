import type { Draft, Patches } from 'mutative';
import type { Listener } from './interface';

export interface Internal<T> {
  module: T;
  rootState: T | Draft<T>;
  backupState: T | Draft<T>;
  // TODO: fix the type of finalizeDraft
  finalizeDraft: () => [T, Patches, Patches];
  mutableInstance: any;
  sequence: number;
  isBatching: boolean;
  listeners: Set<Listener>;
}
