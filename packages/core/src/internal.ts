import type { Draft, Patches } from 'mutative';
import type { CreateState, Listener } from './interface';

export interface Internal<T extends CreateState = CreateState> {
  /**
   * Get the mutable raw instance via the initial state.
   */
  toMutableRaw?: (key: any) => any;
  /**
   * The store module.
   */
  module: T;
  /**
   * The root state.
   */
  rootState: T | Draft<T>;
  /**
   * The backup state.
   */
  backupState: T | Draft<T>;
  /**
   * Finalize the draft.
   */
  finalizeDraft: () => [T, Patches, Patches];
  /**
   * The mutable instance.
   */
  mutableInstance: any;
  /**
   * The sequence number.
   */
  sequence: number;
  /**
   * Whether the batch is running.
   */
  isBatching: boolean;
  /**
   * The listeners.
   */
  listeners: Set<Listener>;
}
