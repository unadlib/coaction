import type { Draft, Patches } from 'mutative';
import type { CreateState, Listener } from './interface';

export interface Internal<T extends CreateState = CreateState> {
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
  /**
   * The act is used to run the function in the action for mutable state.
   */
  actMutable?: <T extends () => any>(fn: T) => ReturnType<T>;
  /**
   * Get the mutable raw instance via the initial state.
   */
  toMutableRaw?: (key: any) => any;
  /**
   * The update immutable function.
   */
  updateImmutable?: (state: T) => void;
}
