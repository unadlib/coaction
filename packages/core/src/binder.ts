import type { Store } from './interface';
import { bindSymbol } from './constant';
import { Internal } from './internal';

/**
 * createBinder is a function to create a binder for the 3rd party store.
 */
export function createBinder<F = (...args: any[]) => any>({
  handleState,
  handleStore
}: {
  /**
   * handleState is a function to handle the state object.
   */
  handleState: <T extends object = object>(
    state: T
  ) => {
    /**
     * copyState is a copy of the state object.
     */
    copyState: T;
    /**
     * key is the key of the state object.
     */
    key?: keyof T;
    /**
     * bind is a function to bind the state object.
     */
    bind: (state: T) => T;
  };
  /**
   * handleStore is a function to handle the store object.
   */
  handleStore: (
    /**
     * Coaction store
     */
    store: Store<object>,
    /**
     * The raw state object from 3rd party library.
     */
    rawState: object,
    /**
     * 3rd party library state object to Coaction state object.
     */
    state: object,
    /**
     * internal Coaction API.
     */
    internal: Internal<object>,
    /**
     * the key of the slice state object.
     */
    key?: string
  ) => void;
}) {
  return (<S extends object>(state: S): S => {
    const { copyState, key, bind } = handleState(state);
    const value = (key ? copyState[key] : copyState) as {
      [bindSymbol]: {
        handleStore: typeof handleStore;
        bind: typeof bind;
      };
    };
    value[bindSymbol] = {
      handleStore,
      bind
    };
    return copyState;
  }) as F;
}
