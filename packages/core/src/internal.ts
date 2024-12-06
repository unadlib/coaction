import type { Draft, Patches } from 'mutative';
import type { CreateState, Listener } from './interface';

export interface Internal<T extends CreateState = CreateState> {
  module: T;
  rootState: T | Draft<T>;
  backupState: T | Draft<T>;
  finalizeDraft: () => [T, Patches, Patches];
  mutableInstance: any;
  sequence: number;
  isBatching: boolean;
  listeners: Set<Listener>;
}
