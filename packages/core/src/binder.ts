import type { Store } from './interface';
import { bindSymbol } from './constant';

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
  handleStore: (store: Store<object>, rawState: object, state: object) => void;
}) {
  return (<T extends object>(state: T): T => {
    const { copyState, key, bind } = handleState(state);
    const value: any = key ? copyState[key] : copyState;
    value[bindSymbol] = {
      handleStore,
      bind
    };
    return copyState;
  }) as F;
}
